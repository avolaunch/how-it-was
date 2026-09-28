export function expired(finalizedAt, now = new Date()) {
  if (!finalizedAt) return false;
  const end = new Date(finalizedAt);
  if (Number.isNaN(end.getTime())) return false;
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  return now >= end;
}

export async function deleteRecord(env, id) {
  await env.DB.prepare("UPDATE records SET status = 'deleting' WHERE id = ? AND status = 'finalized'").bind(id).run();
  const prefix = 'records/' + id + '/';
  let page;
  do {
    page = await env.PHOTOS.list({prefix, limit:1000});
    if (page.objects.length) await env.PHOTOS.delete(page.objects.map(object => object.key));
  } while (page.objects.length);
  await env.DB.prepare('DELETE FROM photos WHERE record_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM records WHERE id = ?').bind(id).run();
}

export async function removeExpired(env, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const rows = await env.DB.prepare("SELECT id FROM records WHERE status = 'deleting' OR (status = 'finalized' AND finalized_at <= ?) ORDER BY finalized_at LIMIT 20")
    .bind(cutoff.toISOString()).all();
  for (const row of rows.results || []) await deleteRecord(env, row.id);
  return (rows.results || []).length;
}
