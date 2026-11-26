import { Order } from '../types';
import { formatBRL } from './pricing';

let sharedAudioContext: AudioContext | null = null;
let customMp3Checked: boolean | null = null;

function getAudioContextClass(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  );
}

function getOrCreateAudioContext(): AudioContext | null {
  const AudioCtx = getAudioContextClass();
  if (!AudioCtx) return null;
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioCtx();
  }
  return sharedAudioContext;
}

/**
 * Desbloqueia o AudioContext e aquece o sintetizador de voz (SpeechSynthesis)
 * a partir de uma interação do usuário (essencial no Android/iOS).
 */
export async function unlockAudioEngine(): Promise<boolean> {
  try {
    const ctx = getOrCreateAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      // Pulso silencioso curto para liberar áudio no iOS Safari
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.02);
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
    return true;
  } catch {
    return false;
  }
}

async function hasCustomMp3Asset(): Promise<boolean> {
  if (customMp3Checked !== null) return customMp3Checked;
  try {
    const res = await fetch('/alerta-rotajusta.mp3', { method: 'HEAD' });
    const contentType = res.headers.get('content-type') || '';
    customMp3Checked = res.ok && contentType.toLowerCase().startsWith('audio/');
    return customMp3Checked;
  } catch {
    customMp3Checked = false;
    return false;
  }
}

/**
 * Acorde duplo rápido e agradável em tom ascendente via Web Audio API.
 */
export async function playDoubleAscendingChime(): Promise<void> {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;

    const scheduleTone = (
      freq: number,
      startOffset: number,
      duration: number
    ) => {
      const osc = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);

      harmonic.type = 'triangle';
      harmonic.frequency.setValueAtTime(freq * 1.5, now + startOffset);

      const harmonicGain = ctx.createGain();
      harmonicGain.gain.setValueAtTime(0.18, now + startOffset);

      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.28, now + startOffset + 0.025);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + startOffset + duration
      );

      osc.connect(gain);
      harmonic.connect(harmonicGain);
      harmonicGain.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
      harmonic.start(now + startOffset);
      harmonic.stop(now + startOffset + duration + 0.02);
    };

    // Tom ascendente limpo: D5 -> A5
    scheduleTone(587.33, 0, 0.16);
    scheduleTone(880.0, 0.17, 0.26);
  } catch {
    // Silencioso caso o navegador bloqueie antes da interação
  }
}

export function speakRotaJustaOffer(
  spokenText = 'RotaJusta! Nova oferta de entrega disponível.'
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = 'pt-BR';
    utterance.pitch = 1.15;
    utterance.rate = 1.05;
    utterance.volume = 1;

    const voices = window.speechSynthesis.getVoices();
    const ptBrVoice =
      voices.find((v) => v.lang.toLowerCase() === 'pt-br') ||
      voices.find((v) => v.lang.toLowerCase().startsWith('pt'));
    if (ptBrVoice) {
      utterance.voice = ptBrVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch {
    // Fallback silencioso
  }
}

/**
 * Toca o som personalizado /alerta-rotajusta.mp3 (se existir em public/)
 * ou o acorde duplo Web Audio API seguido da fala em pt-BR "RotaJusta! Nova oferta de entrega disponível."
 */
export async function playRotaJustaAlert(
  customSpokenText?: string
): Promise<void> {
  await unlockAudioEngine();

  const useCustomMp3 = await hasCustomMp3Asset();
  if (useCustomMp3) {
    try {
      const audio = new Audio('/alerta-rotajusta.mp3');
      audio.volume = 1;
      await audio.play();
      return;
    } catch {
      // Caso o arquivo falhe ou esteja bloqueado, segue para Web Audio + fala
    }
  }

  await playDoubleAscendingChime();

  window.setTimeout(() => {
    speakRotaJustaOffer(customSpokenText);
  }, 390);
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  if (Notification.permission === 'denied') {
    return 'denied';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showBrowserDeliveryNotification(order: Order): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const typeLabel =
    order.type === 'frete'
      ? 'Pequeno Frete'
      : order.type === 'rota'
      ? `Rota Consolidada (${order.packageCount} pcts)`
      : 'Entrega Rápida';

  const distanceText =
    order.distanceKm !== undefined ? ` • ${order.distanceKm} km` : '';

  try {
    const notification = new Notification(
      `RotaJusta! Nova oferta (${order.code})`,
      {
        body: `${typeLabel}${distanceText} • ${order.pickupNeighborhood} → ${order.destinationNeighborhood} • ${formatBRL(order.basePayout)}`,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: `rotajusta-offer-${order.id}`,
      }
    );
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Ignorar caso o ambiente iframe não permita Notification direta
  }
}
