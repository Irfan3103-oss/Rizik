import { useEffect, useState } from 'react';

export interface CountdownState {
  totalMs: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
  urgent: boolean;
  formatted: string;
}

function computeCountdown(targetMs: number, nowMs: number): CountdownState {
  const diff = targetMs - nowMs;
  if (!Number.isFinite(targetMs) || diff <= 0) {
    return {
      totalMs: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: true,
      urgent: false,
      formatted: '00:00',
    };
  }
  const totalSec = Math.floor(diff / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatted =
    hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
  return {
    totalMs: diff,
    hours,
    minutes,
    seconds,
    expired: false,
    urgent: diff <= 75 * 60_000,
    formatted,
  };
}

export function useCountdown(targetIso?: string | null): CountdownState {
  const targetMs = targetIso ? new Date(targetIso).getTime() : 0;
  const [state, setState] = useState<CountdownState>(() => computeCountdown(targetMs, Date.now()));

  useEffect(() => {
    setState(computeCountdown(targetMs, Date.now()));
    if (!targetIso || !Number.isFinite(targetMs)) return;
    const id = window.setInterval(() => {
      setState(computeCountdown(targetMs, Date.now()));
    }, 1000);
    return () => window.clearInterval(id);
  }, [targetIso, targetMs]);

  return state;
}
