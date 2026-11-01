import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAppTheme } from '@/hooks/useAppTheme';

/**
 * Finance v2.5: abertura interna inspirada no conceito alternativo aprovado.
 * É mostrada somente durante a restauração de aparência / inicialização SQLite.
 * Não há temporizadores para atrasar artificialmente a entrada no aplicativo.
 */
export function FinanceLoadingScreen() {
  const { scheme } = useAppTheme();
  const { height } = useWindowDimensions();
  const pulse = useRef(new Animated.Value(0)).current;
  const background = scheme === 'dark' ? '#002B23' : '#003E30';

  useEffect(() => {
    let running = true;
    let animation: Animated.CompositeAnimation | null = null;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (!running || reduceMotion) return;
        animation = Animated.loop(
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1500,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        );
        animation.start();
      })
      .catch(() => {
        // Sem animação, os três pontos permanecem visíveis.
      });

    return () => {
      running = false;
      animation?.stop();
    };
  }, [pulse]);

  const opacity = [0, 1, 2].map((index) =>
    pulse.interpolate({
      inputRange: [0, 0.25, 0.5, 0.75, 1],
      outputRange: [
        index === 0 ? 1 : 0.35,
        index === 1 ? 1 : 0.35,
        index === 2 ? 1 : 0.35,
        index === 0 ? 1 : 0.35,
        index === 0 ? 1 : 0.35,
      ],
    }),
  );

  return (
    <View style={[styles.screen, { backgroundColor: background }]}>
      <StatusBar style="light"  />
      <Image
        source={require('../../../assets/loading-waves.png')}
        resizeMode="stretch"
        accessibilityIgnoresInvertColors
        style={[styles.waves, { height: Math.min(275, height * 0.34) }]}
      />

      <View style={styles.content}>
        <View style={styles.brand}>
          <Image
            source={require('../../../assets/splash-icon.png')}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            style={styles.brandImage}
          />
          <Text style={styles.title}>Finance</Text>
          <Text style={styles.subtitle}>Seu controle financeiro</Text>
        </View>

        <View style={styles.loadingBlock} accessibilityRole="progressbar"
          accessibilityLabel="Carregando seus dados">
          <View style={styles.dots} importantForAccessibility="no-hide-descendants">
            {opacity.map((value, index) => (
              <Animated.View
                key={index}
                style={[styles.dot, { opacity: value }]}
              />
            ))}
          </View>
          <Text style={styles.loadingText}>Carregando seus dados...</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  waves: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    opacity: 0.95,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 36,
    zIndex: 1,
  },
  brand: { alignItems: 'center', width: '100%' },
  brandImage: { width: 148, height: 148 },
  title: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -0.9,
    textAlign: 'center',
    marginTop: 6,
  },
  subtitle: {
    color: '#E1F3E9',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
  },
  loadingBlock: { alignItems: 'center', marginTop: 64, minHeight: 58 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 15 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#56F1A1',
  },
  loadingText: {
    color: '#E6F6EE',
    fontSize: 12,
    marginTop: 14,
    textAlign: 'center',
  },
});
