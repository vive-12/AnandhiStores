import { Linking, Platform, ActionSheetIOS, Alert } from 'react-native';

/**
 * Shows a native picker to open Apple Maps / Google Maps.
 * iOS  → ActionSheetIOS (native bottom sheet)
 * Android → Alert dialog
 */
export function openMapChoice(lat, lng, label) {
  const encodedLabel = encodeURIComponent(label || 'Location');

  const openApple = () => {
    const url = lat && lng
      ? `maps://?q=${encodedLabel}&ll=${lat},${lng}`
      : `maps://?q=${encodedLabel}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.apple.com/?q=${encodedLabel}${lat ? `&ll=${lat},${lng}` : ''}`)
    );
  };

  const openGoogle = () => {
    const url = lat && lng
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodedLabel}`;
    Linking.openURL(url);
  };

  const openWaze = () => {
    const url = lat && lng
      ? `waze://?ll=${lat},${lng}&navigate=yes`
      : `waze://?q=${encodedLabel}`;
    Linking.canOpenURL(url).then(ok => {
      if (ok) Linking.openURL(url);
      else Linking.openURL(`https://www.waze.com/ul?q=${encodedLabel}`);
    });
  };

  if (!lat && !lng && !label) {
    Alert.alert('No Location', 'This user has no location data yet.');
    return;
  }

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Open Location In…',
        options: ['Apple Maps', 'Google Maps', 'Cancel'],
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) openApple();
        if (index === 1) openGoogle();
      }
    );
  } else {
    // Android
    Alert.alert('Open Location In…', label || 'Choose a maps app', [
      { text: '🗺  Google Maps', onPress: openGoogle },
      { text: '🚗  Waze',        onPress: openWaze },
      { text: 'Cancel',          style: 'cancel' },
    ]);
  }
}
