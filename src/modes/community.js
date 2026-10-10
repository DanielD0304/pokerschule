// Ranglisten, Freunde, Gruppen und Wochen-Challenge im Browser (Roadmap 03). Alles läuft über Funktionen der
// Datenbank (supabase/migrations/…_community.sql) und die Edge Function "challenge"; die prüfen selbst die Rechte.
import { enabled, supabase } from './account.js';

export { enabled };

/** Verständliche Meldung aus einem Datenbankfehler (unsere Funktionen werfen deutsche Texte). */
function message(error) {
  const msg = String(error?.message || error);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Keine Verbindung zum Server. Prüfe deine Internetverbindung.';
  if (/JWT|not authenticated|permission denied/i.test(msg)) return 'Bitte melde dich an.';
  return msg;
}
async function rpc(name, args = {}) {
  const sb = await supabase();
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(message(error));
  return data;
}

// ---------- Ranglisten ----------
export const leaderboard = ({ board = 'overall', period = 'all', scope = 'all', group = null, limit = 100 } = {}) =>
  rpc('leaderboard', { p_board: board, p_period: period, p_scope: scope, p_group: group, p_limit: limit });
export const weeklyBoard = ({ week, scope = 'all', group = null, limit = 100 }) =>
  rpc('weekly_board', { p_week: week, p_scope: scope, p_group: group, p_limit: limit });

// ---------- Freunde ----------
export const friends = () => rpc('friends_list');
export const friendLink = (renew = false) => rpc('friend_link', { p_renew: renew });
export const peekFriendLink = async code => (await rpc('friend_link_peek', { p_code: code }))?.[0] ?? null;
export const acceptFriendLink = code => rpc('friend_link_accept', { p_code: code });
export const requestFriend = name => rpc('friend_request', { p_name: name });
export const respondFriend = (id, accept) => rpc('friend_respond', { p_other: id, p_accept: accept });
export const removeFriend = id => rpc('friend_remove', { p_other: id });
export const compareWith = id => rpc('friend_compare', { p_other: id });

// ---------- Gruppen ----------
export const myGroups = () => rpc('my_groups');
export const createGroup = name => rpc('group_create', { p_name: name });
export const groupInfo = id => rpc('group_info', { p_group: id });
export const groupInvite = async (id, renew = false) => (await rpc('group_invite', { p_group: id, p_renew: renew }))?.[0] ?? null;
export const peekGroup = async code => (await rpc('group_peek', { p_code: code }))?.[0] ?? null;
export const joinGroup = code => rpc('group_join', { p_code: code });
export const leaveGroup = id => rpc('group_leave', { p_group: id });
export const kickMember = (id, user) => rpc('group_kick', { p_group: id, p_user: user });
export const promoteMember = (id, user) => rpc('group_promote', { p_group: id, p_user: user });
export const renameGroup = (id, name) => rpc('group_rename', { p_group: id, p_name: name });
export const deleteGroup = id => rpc('group_delete', { p_group: id });
export const saveSet = (id, name, spots, note) => rpc('group_set_save', { p_group: id, p_name: name, p_spots: spots, p_note: note || null });
export const deleteSet = set => rpc('group_set_delete', { p_set: set });
export const recordSet = (set, { n, wrong, loss }) => rpc('group_set_record', { p_set: set, p_n: n, p_wrong: wrong, p_loss: loss });

// ---------- Wochen-Challenge (Edge Function) ----------
async function challenge(action, body = {}) {
  const sb = await supabase();
  const { data, error } = await sb.functions.invoke('challenge', { body: { action, ...body } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch { /* keine JSON-Antwort */ }
    throw new Error(message(msg));
  }
  return data;
}
export const weekCurrent = () => challenge('current');
export const weekStart = () => challenge('start');
export const weekAnswer = (week, index, choice) => challenge('answer', { week, index, choice });
export const weekReview = week => challenge('review', { week });
export const weekList = () => challenge('weeks');

/** Einladungslink zum Teilen (Gruppe oder Freund). */
export const inviteUrl = (path, code) => `${location.origin}${path}?einladung=${code}`;
