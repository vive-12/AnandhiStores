'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
if(!process.argv.includes('--allow-dev-writes')||!process.argv.includes('--project=anandhi-stores'))throw new Error('Use the explicit development test command; it writes test orders to anandhi-stores.');
const h=require('../Shared/service-harness.cjs');const {connect}=require('../Shared/live-adapter.cjs');
let live,assertions=0;const results=[],orderIds=[];const restorations=[];
function check(value,message){if(!value)throw new Error(message);assertions++;console.log('  PASS '+message);}
async function reject(work,message){let rejected=false;try{await work();}catch{rejected=true;}check(rejected,message);}
async function scenario(id,title,work){console.log('\n'+id+' '+title);try{await work();results.push({id,title,status:'passed'});}catch(e){results.push({id,title,status:'failed',message:e.message});throw e;}}
async function main(){
  live=await connect();const {actors,env,runId}=live;const {admin,customer,agent}=actors;
  console.log('LIVE DEVELOPMENT SERVICE FLOW '+runId+' — actual Firestore data, privileged IAM adapter; not a screen/rules test.');
  const orders=h.service('orders'),auth=h.service('auth'),users=h.service('users'),help=h.service('accountHelp'),notifs=h.service('notifications'),settings=h.service('settings'),qr=h.service('qr');const {useSession}=h.hook('useSession');const act=u=>useSession.getState().setSession({...u,id:u.uid||u.id,status:'approved',isDemo:true});
  const originalSettings=await live.api('/settings/store');if(!originalSettings)throw new Error('Store settings missing');
  const originalProfiles={};for(const role of ['admin','customer','agent'])originalProfiles[role]=await live.api('/users/'+actors[role].uid);
  const originalQr=await live.getDocs(h.firestore.collection(h.db,'qr_codes'));
  let generatedQr;
  restorations.push(async()=>{
    // Restore configuration and credentials, preserving operational balances from any unfinished run.
    await settings.saveSettings({...await settings.getSettings(),instantDeliveryEnabled:false});
    if(generatedQr)await qr.deleteQRCode(generatedQr);
    for(const doc of originalQr.docs)await h.firestore.updateDoc(doc.ref,{isDefault:!!doc.data().isDefault});
    for(const role of ['admin','customer','agent']){
      const original=originalProfiles[role],current=await live.api('/users/'+actors[role].uid);const restoreKeys=['pin','status','mustChangePin','isArchived','isOnline','deactivatedAt'];const fields={};for(const k of restoreKeys)if(original.fields[k])fields[k]=original.fields[k];
      fields.sessionVersion={integerValue:String(Math.max(Number(original.fields.sessionVersion?.integerValue||0),Number(current.fields.sessionVersion?.integerValue||0))+1)};
      await live.commit([{update:{name:original.name,fields},updateMask:{fieldPaths:[...restoreKeys,'sessionVersion']}}]);
    }
    await live.commit([{update:{name:originalSettings.name,fields:originalSettings.fields}}]);
  });
  const storeSettings=await settings.getSettings();await settings.saveSettings({...storeSettings,isStoreOpenOverride:true,instantDeliveryEnabled:true});
  const waterQuery=h.firestore.query(h.firestore.collection(h.db,'items'),h.firestore.where('unit','==','can'),h.firestore.limit(10));
  const water=(await live.getDocs(waterQuery)).docs.find(d=>d.data().inStock!==false&&!d.data().isDeleted);if(!water)throw new Error('No active water-can product is available for development regression.');
  const product=water.data(),price=Number(product.price);if(!Number.isFinite(price)||price<=0)throw new Error('Test water item price invalid');const qty=Math.max(2,Math.ceil(Number(storeSettings.minOrderValue||1)/price));const subtotal=qty*price;const deliveryFee=subtotal>=Number(storeSettings.freeDeliveryAbove||Infinity)?0:Number(storeSettings.deliveryFee||0);const total=subtotal+deliveryFee;
  const profile=(await live.getDoc(h.firestore.doc(h.db,'users',customer.uid))).data();const beforeCan=Number(profile.pendingCans||0);
  const base={actor:customer,items:[{itemId:water.id,name:product.name,unit:'can',isWaterCan:true,price,qty,lineTotal:subtotal}],customerName:customer.name,customerPhone:customer.phone,customerId:customer.uid,addressSnapshot:{door:'DEV TEST',street:'Regression order - do not dispatch',locality:'Chennai',city:'Chennai',landmark:runId,lat:null,lng:null},subtotal,deliveryFee,total,slot:{type:'asap',label:'5 min'},notes:'[REGRESSION '+runId+'] DO NOT DISPATCH. Test data retained for later owner cleanup.',source:'customer'};
  const fresh=id=>orders.getOrder(id);
  const stage=async(id,status,actor,extras={})=>orders.transitionOrder({orderId:id,order:await fresh(id),toStatus:status,actor,...extras});
  const notesFor=async(id)=>{const docs=await live.getDocs(h.firestore.query(h.firestore.collection(h.db,'notifications'),h.firestore.where('orderId','==',id),h.firestore.limit(100)));return docs.docs.map(d=>({id:d.id,...d.data()}));};
  await scenario('DEV-AUTH','All three real development role logins',async()=>{for(const role of ['admin','customer','agent']){const u=await auth.loginWithPhone({phone:env[role.toUpperCase()+'_PHONE'],pin:env[role.toUpperCase()+'_PIN']});check(u.id===actors[role].uid&&u.role===role,'Correct development '+role+' profile/PIN');}});
  let codId,recoveryId;
  await scenario('DEV-ORDER','Shivani places COD water order; Vivek and Suresh see the same ownership',async()=>{
    act(customer);codId=await orders.createOrder(base);orderIds.push(codId);check((await fresh(codId)).customerId===customer.uid,'Customer owns created order');const notices=await notesFor(codId);check(notices.some(n=>n.toUid===admin.uid&&n.type==='order_placed'),'Admin receives durable placed-order event');
    act(admin);await users.setAgentOnline(agent.uid,true);await orders.assignAgent({orderId:codId,order:await fresh(codId),agent,agentFee:Number(storeSettings.agentFeePerDelivery||0),customerId:customer.uid,adminUid:admin.uid});
    check((await fresh(codId)).agentId===agent.uid,'Assigned delivery references Suresh');const assigned=await notesFor(codId);check(assigned.some(n=>n.toUid===agent.uid)&&assigned.some(n=>n.toUid===customer.uid),'Assignment reflects in agent and customer notices');
    await stage(codId,'packed',admin);await reject(()=>stage(codId,'cancelled',customer,{cancelReason:'race test'}),'Packed order rejects stale customer cancellation');
    await reject(()=>stage(codId,'out_for_delivery',agent),'Pickup without checked items is rejected');await stage(codId,'out_for_delivery',agent,{checkedItems:{0:true}});check((await fresh(codId)).status==='out_for_delivery','Checked pickup reflects persisted delivery state');
    await reject(()=>users.setAgentOnline(agent.uid,false),'Agent availability cannot conceal active delivery');await reject(()=>users.deleteAgent(agent.uid),'Agent cannot be removed while assigned work exists');
  });
  await scenario('DEV-PIN','Failed attempts, admin help, reset and block during open delivery',async()=>{
    const wrong=env.CUSTOMER_PIN==='0000'?'9999':'0000';await help.clearPinFailures(customer.phone);
    for(let i=0;i<4;i++)await reject(()=>auth.loginWithPhone({phone:customer.phone,pin:wrong}),'Bad PIN attempt '+(i+1)+' rejected');
    const helpEntry=(await live.getDoc(h.firestore.doc(h.db,'account_help',customer.phone))).data();check(helpEntry.status==='open'&&helpEntry.attempts===4,'Admin help records repeated failed attempts');
    const helpNotices=await live.getDocs(h.firestore.query(h.firestore.collection(h.db,'notifications'),h.firestore.where('toUid','==',admin.uid),h.firestore.where('type','==','account_help'),h.firestore.limit(100)));check(helpNotices.docs.length>0,'Admin inbox has account-help event');
    const customerBefore=(await live.getDoc(h.firestore.doc(h.db,'users',customer.uid))).data();await auth.saveSession({...customerBefore,id:customer.uid});act(admin);const temporary=env.CUSTOMER_PIN==='2468'?'1357':'2468';await auth.adminResetPin(customer.uid,customer.phone,temporary);
    check(await auth.restoreSession()===null,'Reset invalidates stored warm customer session');check((await fresh(codId)).status==='out_for_delivery','Reset leaves active order untouched');
    await reject(()=>auth.loginWithPhone({phone:customer.phone,pin:env.CUSTOMER_PIN}),'Old PIN rejected after admin reset');const tempLogin=await auth.loginWithPhone({phone:customer.phone,pin:temporary});check(tempLogin.mustChangePin,'Temporary login requires PIN change');act(tempLogin);await auth.changePin(customer.uid,customer.phone,temporary,env.CUSTOMER_PIN);check((await auth.loginWithPhone({phone:customer.phone,pin:env.CUSTOMER_PIN})).id===customer.uid,'Original known PIN restored through self-change');
    act(admin);await users.blockUser(customer.uid);await reject(()=>orders.createOrder(base),'Blocked customer cannot submit checkout');check((await fresh(codId)).status==='out_for_delivery','Blocking preserves delivery work');await users.updateUser(customer.uid,{status:customerBefore.status});
    const resolved=(await live.getDoc(h.firestore.doc(h.db,'account_help',customer.phone))).data();check(resolved.status==='resolved'&&resolved.attempts===0,'Admin assistance resolves failed-login queue');
  });
  await scenario('DEV-RECOVERY','Delivery creates segregated can work; partial visit remains open; later visit finishes remainder',async()=>{
    const date=h.service('stats').getISTDateKey(h.TestTimestamp.now().toDate());const statsRef=h.firestore.doc(h.db,'stats_daily',date);const before=(await live.getDoc(statsRef)).data()||{};
    await stage(codId,'delivered',agent,{emptyCansCollected:0,paymentMethod:'COD'});
    const recoveries=await live.getDocs(h.firestore.query(h.firestore.collection(h.db,'orders'),h.firestore.where('parentOrderId','==',codId),h.firestore.limit(10)));check(recoveries.docs.length===1,'Exactly one recovery created for delivered purchase');recoveryId=recoveries.docs[0].id;orderIds.push(recoveryId);
    const after=(await live.getDoc(statsRef)).data();check(after.orders===Number(before.orders||0)+1&&Math.abs(after.revenue-Number(before.revenue||0)-total)<0.001,'COD retail sales and order totals advance exactly once');
    check((await live.getDoc(h.firestore.doc(h.db,'users',customer.uid))).data().pendingCans===beforeCan+qty,'Customer balance includes unreturned cans');await reject(()=>stage(codId,'delivered',agent,{emptyCansCollected:0,paymentMethod:'COD'}),'Repeated completion cannot duplicate sales');
    await reject(()=>users.deleteAgent(agent.uid),'Open collection prevents agent removal after retail delivery');
    await stage(recoveryId,'out_for_delivery',agent);await stage(recoveryId,'delivered',agent,{emptyCansCollected:1});const partial=await fresh(recoveryId);check(partial.status==='placed'&&partial.pendingCansToCollect===qty-1,'Partial recovery stays on same open order with remainder');const afterPartial=(await live.getDoc(statsRef)).data();check(afterPartial.orders===after.orders&&afterPartial.revenue===after.revenue,'Partial collection does not inflate sales or retail deliveries');
    await reject(()=>stage(recoveryId,'delivered',agent,{emptyCansCollected:1}),'Duplicate collection without a new pickup cannot reduce balance');
    await stage(recoveryId,'out_for_delivery',agent);await stage(recoveryId,'delivered',agent,{emptyCansCollected:qty-1});const done=await fresh(recoveryId);check(done.status==='delivered'&&done.emptyCansCollected===qty&&done.collectionHistory.length===2,'Second visit closes exact remaining quantity with cumulative history');
    check((await live.getDoc(h.firestore.doc(h.db,'users',customer.uid))).data().pendingCans===beforeCan,'Customer balance returns to pre-run amount');const finalStats=(await live.getDoc(statsRef)).data();check(finalStats.recoveryOrders===Number(before.recoveryOrders||0)+1&&finalStats.orders===after.orders&&finalStats.revenue===after.revenue,'Recovery reporting is segregated from retail sales');
    const recoveredNotices=await notesFor(recoveryId);check([admin.uid,customer.uid].every(uid=>recoveredNotices.some(n=>n.toUid===uid&&n.type==='can_collection')),'Admin/customer receive can collection events');
  });
  await scenario('DEV-SLOT','Instant closure preserves scheduled checkout; customer cancellation appears in history',async()=>{
    await settings.saveSettings({...await settings.getSettings(),instantDeliveryEnabled:false});await reject(()=>orders.createOrder(base),'Instant checkout rejected after admin closes instant delivery');
    const scheduledLabel=(await settings.getSettings()).slots.find(s=>s!=='5 min'&&s.toUpperCase()!=='ASAP');if(!scheduledLabel)throw new Error('Configure a scheduled slot before development regression.');const id=await orders.createOrder({...base,slot:{type:'scheduled',label:scheduledLabel}});orderIds.push(id);check((await fresh(id)).slot.label===scheduledLabel,'Configured scheduled order still succeeds');await stage(id,'cancelled',customer,{cancelReason:'Development regression'});check((await fresh(id)).cancelledBy===customer.uid,'Customer cancellation records actor and terminal history');
    await reject(()=>orders.createOrder({...base,slot:{type:'scheduled',label:'NONEXISTENT REGRESSION SLOT'}}),'Checkout rejects obsolete slot label');
  });
  await scenario('DEV-QR','Admin scanner update reflects in agent payment and accounting',async()=>{
    const scanner=originalQr.docs.find(d=>!d.data().isArchived&&d.data().upiId);if(!scanner)throw new Error('An existing UPI payee is needed to exercise payment without fake payees.');const data=scanner.data();data.imageUrl ||= require('../Shared/qr-fixture.cjs').createPaymentQr(data.upiId,data.merchantName||'Anandhi Stores');generatedQr=await qr.saveQRCode({name:'[REGRESSION '+runId+'] '+data.name,upiId:data.upiId,imageUrl:data.imageUrl,merchantName:data.merchantName,isDefault:true});check((await qr.getDefaultQRCode()).id===generatedQr,'Agent sees admin-selected scanner and matching UPI');
    await settings.saveSettings({...await settings.getSettings(),instantDeliveryEnabled:true});const id=await orders.createOrder(base);orderIds.push(id);await orders.assignAgent({orderId:id,order:await fresh(id),agent,agentFee:Number(storeSettings.agentFeePerDelivery||0),customerId:customer.uid,adminUid:admin.uid});await stage(id,'packed',admin);await stage(id,'out_for_delivery',agent,{checkedItems:{0:true}});await stage(id,'delivered',agent,{emptyCansCollected:qty,paymentMethod:'upi_qr',qrId:generatedQr,qrLabel:data.name,qrUpiId:data.upiId});
    const paid=await fresh(id),account=(await live.getDoc(h.firestore.doc(h.db,'qr_codes',generatedQr))).data();check(paid.qrUpiId===data.upiId&&paid.paymentMethod==='upi_qr','Delivered purchase freezes used QR/UPI details');check(account.totalSales===total&&account.orderCount===1,'QR accounting increments for exactly one retail delivery');
    await reject(()=>qr.saveQRCode({id:generatedQr,name:'Blocked edit',upiId:data.upiId,imageUrl:data.imageUrl}),'Open instant delivery prevents concurrent payee edits');await settings.saveSettings({...await settings.getSettings(),instantDeliveryEnabled:false});await qr.saveQRCode({id:generatedQr,name:'[REGRESSION edited] '+data.name,upiId:data.upiId,imageUrl:data.imageUrl,merchantName:data.merchantName,isDefault:true});check((await live.getDoc(h.firestore.doc(h.db,'qr_codes',generatedQr))).data().totalSales===total,'Editing QR metadata preserves completed sale totals');
  });
  await scenario('DEV-NOTICE','In-app read state and settled-agent archival preserve order references',async()=>{
    const docs=await notesFor(codId);const notice=docs.find(n=>n.toUid===admin.uid);await notifs.markRead(notice.id);check((await live.getDoc(h.firestore.doc(h.db,'notifications',notice.id))).data().read,'Admin mark-read persists');act(admin);await users.deleteAgent(agent.uid);check((await live.getDoc(h.firestore.doc(h.db,'users',agent.uid))).data().isArchived,'Settled agent is soft archived');check((await fresh(codId)).agentId===agent.uid,'Historical assignment still identifies Suresh');
  });
}
(async()=>{let error;try{await main();}catch(e){error=e;console.error('FAIL: '+e.message);}finally{for(const restore of restorations.reverse())try{await restore();results.push({id:'DEV-RESTORE',status:'passed',title:'Temporary credentials, statuses, QR defaults and store settings restored'});}catch(e){error=error||e;results.push({id:'DEV-RESTORE',status:'failed',message:e.message});console.error('RESTORE FAILED: '+e.message);}}
  const report={project:'anandhi-stores',runId:live?.runId,mode:'privileged-development-service',notProven:['native button rendering','client Firestore rules','device push delivery','real elapsed multi-day wait'],assertions,success:!error,results,testOrderIds:orderIds,requestCount:live?.requests()};
  const folder=process.env.TEST_REPORT_DIR||path.resolve(__dirname,'../../.verify/tests/latest');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'development.json'),JSON.stringify(report,null,2));console.log('\n'+(error?'FAIL':'PASS')+': '+assertions+' live development assertions; '+orderIds.length+' test orders/recoveries retained.');process.exitCode=error?1:0;
})();
