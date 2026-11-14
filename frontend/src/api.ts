export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8787").replace(/\/$/, "");

const TOKEN_KEY = "tasksbot_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401) {
    setToken(null);
    onUnauthorized();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export type Priority = "Low" | "Medium" | "High" | "Critical";
export type Status = "pending" | "in_progress" | "completed";

export interface Task {
  id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: Priority;
  status: Status;
  category: string | null;
  tags: string | null;
  is_reminder_set: boolean;
  reminder_time: string | null;
  reminder_sent: boolean;
  created_at: string;
  updated_at: string;
}

export type TaskInput = Partial<Omit<Task, "id" | "created_at" | "updated_at" | "reminder_sent">>;

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  email_notifications: boolean;
  slack_notifications: boolean;
  slack_connected: boolean;
  slack_channel: string | null;
}

export interface Stats {
  total: number;
  completed: number;
  pending: number;
  in_progress: number;
  overdue: number;
  due_soon: number;
  completion_rate: number;
}

export interface Providers {
  google: boolean;
  github: boolean;
  slack: boolean;
}

export interface LogEntry {
  id: number;
  task_id: number | null;
  task_title: string | null;
  channel: "email" | "slack" | "push";
  kind: "reminder" | "due" | "test";
  success: boolean;
  error: string | null;
  created_at: string;
}

export const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Critical"];
export const STATUSES: { value: Status; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

// ---- date helpers: <input type="datetime-local"> works in local time; API uses UTC ISO ----
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function localInputToIso(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
export function relativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [86_400_000, "day"],
    [3_600_000, "hour"],
    [60_000, "minute"],
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [ms, unit] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  return rtf.format(Math.round(diff / 1000), "second");
}
