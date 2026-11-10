// Spoken office commands, recognised in the user's own words. Pure: no browser or rendering dependency.
const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();

// "apaga as luzes do office" -> 'off'; "acende a luz" -> 'on'; anything else, or a negated request -> null.
export function lightsCommand(text){
  const t=norm(text);
  if(!/\b(luz|luzes|iluminacao)\b/.test(t))return null;
  if(/\bnao\b.{0,14}\b(apag|deslig|acend|lig)/.test(t))return null;
  if(/\b(apag\w*|deslig\w*)\b.{0,40}\b(luz|luzes|iluminacao)\b/.test(t))return 'off';
  if(/\b(acend\w*|lig\w*|religa\w*)\b.{0,40}\b(luz|luzes|iluminacao)\b/.test(t))return 'on';
  return null;
}
