import type { SpeakerRoleMap, SpeakerMap, TranscriptSegment } from "../db/types.js";

export interface SpeakerState {
  segments: TranscriptSegment[];
  speakers: SpeakerMap;
  speakerRoles: SpeakerRoleMap;
  selfSpeakerId: string | null;
}

/**
 * Слияние спикеров (дубли диаризации): реплики `from` становятся репликами `into`; имя, роль и отметка «это я»
 * переходят к основному, если у него их не было. Цепочки (a→b, b→c) разрешаются до конечной цели, циклы игнорируются.
 * Соседние реплики одного спикера после слияния склеиваются, если пауза между ними меньше секунды.
 */
export function applySpeakerMerges(state: SpeakerState, merges: Record<string, string>): SpeakerState {
  const resolve = (id: string): string => {
    let cur = id;
    const seen = new Set<string>();
    while (merges[cur] && merges[cur] !== cur && !seen.has(cur)) {
      seen.add(cur);
      cur = merges[cur]!;
    }
    return seen.has(cur) ? id : cur; // цикл — оставляем как есть
  };
  const map = new Map<string, string>();
  for (const from of Object.keys(merges)) {
    const to = resolve(from);
    if (to !== from) map.set(from, to);
  }
  if (map.size === 0) return state;

  const speakers: SpeakerMap = { ...state.speakers };
  const roles: SpeakerRoleMap = { ...state.speakerRoles };
  for (const [from, to] of map) {
    if (speakers[from] && !speakers[to]) speakers[to] = speakers[from]!;
    if (roles[from] && !roles[to]) roles[to] = roles[from]!;
    delete speakers[from];
    delete roles[from];
  }
  const selfSpeakerId = state.selfSpeakerId ? (map.get(state.selfSpeakerId) ?? state.selfSpeakerId) : null;

  const segments: TranscriptSegment[] = [];
  for (const s of state.segments) {
    const speakerId = map.get(s.speakerId) ?? s.speakerId;
    const prev = segments[segments.length - 1];
    if (prev && prev.speakerId === speakerId && s.start - prev.end < 1) {
      segments[segments.length - 1] = { ...prev, end: Math.max(prev.end, s.end), text: `${prev.text} ${s.text}`.trim() };
    } else {
      segments.push({ ...s, speakerId });
    }
  }
  return { segments, speakers, speakerRoles: roles, selfSpeakerId };
}
