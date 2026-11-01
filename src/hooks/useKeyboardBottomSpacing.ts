import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** Espaço adicional para rolar formulários sob o IME, inclusive no Android edge-to-edge. */
export function useKeyboardBottomSpacing(normalPadding: number): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', e => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return Math.max(normalPadding, height + 24);
}
