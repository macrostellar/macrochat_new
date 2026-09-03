import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useApp } from '@/context/AppContext';
import { playNotificationPing } from '@/lib/sound';

function drawBadge(baseHref: string, count: number, ringing: boolean, onReady: (dataUrl: string) => void) {
  const img = new Image();
  img.onload = () => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, size, size);

    const radius = 15;
    const cx = size - radius - 2;
    const cy = radius + 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = ringing ? '#22C55E' : '#FF4D4F';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0B0F1A';
    ctx.stroke();

    if (count > 0) {
      ctx.fillStyle = '#0B0F1A';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(count > 9 ? '9+' : String(count), cx, cy + 1);
    }

    onReady(canvas.toDataURL('image/png'));
  };
  img.onerror = () => undefined;
  img.src = baseHref;
}

// Web-only: badges the browser tab favicon and title with unread/incoming-call state.
export function TabActivityBadge() {
  const { chats, activeCall } = useApp();
  const baseTitleRef = useRef<string | null>(null);
  const baseFaviconRef = useRef<string | null>(null);
  const faviconLinkRef = useRef<HTMLLinkElement | null>(null);
  const previousUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    if (baseTitleRef.current === null) baseTitleRef.current = document.title;
    if (!faviconLinkRef.current) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      faviconLinkRef.current = link;
      baseFaviconRef.current = link.href || '/favicon.ico';
    }

    const unread = chats.reduce((sum, chat) => sum + (chat.unread || 0), 0);
    if (previousUnreadRef.current !== null && unread > previousUnreadRef.current) playNotificationPing();
    previousUnreadRef.current = unread;

    const ringing = Boolean(activeCall?.incoming && activeCall.status === 'ringing');
    const inCall = Boolean(activeCall && !ringing);

    const prefix = ringing ? '\u260E ' : inCall ? '\uD83D\uDCDE ' : unread > 0 ? `(${unread > 99 ? '99+' : unread}) ` : '';
    document.title = `${prefix}${baseTitleRef.current}`;

    const link = faviconLinkRef.current;
    const baseHref = baseFaviconRef.current;
    if (!link || !baseHref) return;

    if (!unread && !ringing && !inCall) {
      link.href = baseHref;
      return;
    }
    drawBadge(baseHref, unread, ringing, (dataUrl) => { link.href = dataUrl; });
  }, [chats, activeCall]);

  return null;
}
