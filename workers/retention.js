export default {
  async scheduled(_event, env, context) {
    context.waitUntil((async()=>{
      const cutoff=new Date();cutoff.setUTCFullYear(cutoff.getUTCFullYear()-1);
      const rows=await env.DB.prepare("SELECT id FROM records WHERE status = 'deleting' OR (status = 'finalized' AND finalized_at <= ?) ORDER BY finalized_at LIMIT 20")
        .bind(cutoff.toISOString()).all();
      for(const {id} of rows.results||[]){
        await env.DB.prepare("UPDATE records SET status = 'deleting' WHERE id = ? AND status = 'finalized'").bind(id).run();
        const prefix='records/'+id+'/';
        let page;
        do{
          page=await env.PHOTOS.list({prefix,limit:1000});
          if(page.objects.length)await env.PHOTOS.delete(page.objects.map(object=>object.key));
        }while(page.objects.length);
        await env.DB.prepare('DELETE FROM photos WHERE record_id = ?').bind(id).run();
        await env.DB.prepare('DELETE FROM records WHERE id = ?').bind(id).run();
      }
    })());
  }
};
