import React from 'react';
import { View, Text } from 'react-native';
import { Colors, Spacing, FontSize, Radius } from '../../theme';
import type { Order } from '../../types';
export function RecoveryList({ orders, balance }: { orders: Order[]; balance?: number }) {
  const runs = orders.filter(o => o.type === 'recovery');
  const outstanding = runs.filter(o => !['delivered', 'cancelled'].includes(o.status));
  return <View style={{ gap: Spacing.md, padding: Spacing.md }}>
    <Text style={{ fontSize: FontSize.lg, color: Colors.ink }}>Empty can collections</Text>
    <Text style={{ color: Colors.inkSoft }}>Outstanding: {balance ?? outstanding.reduce((n, o) => n + Number(o.pendingCansToCollect || 0), 0)} cans. Collections stay open until returned, even when this takes several days.</Text>
    {runs.length === 0 && <Text style={{ color: Colors.inkSoft }}>No collection runs yet. Call the store if your balance needs checking.</Text>}
    {runs.map(run => {
      const days = Math.max(0, Math.floor((Date.now() - (run.createdAt?.toMillis?.() || Date.now())) / 86400000));
      return <View key={run.id} style={{ backgroundColor: Colors.card, borderRadius: Radius.card, padding: Spacing.md, gap: Spacing.sm }}>
        <Text style={{ color: Colors.ink }}>{run.orderNo} · {run.status === 'delivered' ? 'Collected' : run.status === 'out_for_delivery' ? 'Agent collecting' : 'Awaiting collection'}</Text>
        <Text style={{ color: Colors.inkSoft }}>{run.emptyCansCollected || 0} collected · {run.pendingCansToCollect || 0} outstanding · {days} days open</Text>
        <Text style={{ color: Colors.inkSoft }}>{run.agentName ? 'Agent: ' + run.agentName : 'Store will arrange an agent'} · No payment due</Text>
      </View>;
    })}
  </View>;
}
