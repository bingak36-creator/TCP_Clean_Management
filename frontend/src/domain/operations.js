import { parseUtcDate } from './time.js';
export const emptyChecklist = () => ({ floor:false, sink:false, toilet:false, soap:false, trash:false, vent:false });
export const checklistFromRows = rows => {
  const result=emptyChecklist();
  for(const row of rows) if(Object.hasOwn(result,row.itemKey)) result[row.itemKey]=row.completed ?? row.isCompleted ?? false;
  return result;
};
export const businessDate = (date=new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const applyCleaningRecord = (row, worker) => ({...row,lastCleanedHours:0,cleanWorker:worker});
export const recordToLog = record => ({...record,time: record.createdAt ? parseUtcDate(record.createdAt)?.toLocaleString('ko-KR') || '' : ''});
// Commit displayed changes only after the server confirms persistence.
export async function completeCleaning({save,request,commit}) {
  const record=await save(request);
  commit(recordToLog(record), request.zoneId);
  return record;
}

export function createChecklistCoordinator() {
  let scope=null,version=0;
  const writes=new Map();
  return {
    generation:()=>version,
    isCurrent:(candidate,ticket=version)=>candidate===scope&&ticket===version,
    cancel(candidate){if(scope===candidate){scope=null;version++;}},
    async load(candidate,fetchRows,commit) {
      scope=candidate;const ticket=++version;commit(emptyChecklist());
      const pending=writes.get(candidate);
      if(pending)await pending.catch(()=>{});
      const rows=await fetchRows();
      if(scope===candidate&&version===ticket)commit(checklistFromRows(rows));
    },
    async write(candidate,save,commit) {
      if(scope!==candidate||writes.has(candidate))return false;
      const ticket=version;
      const pending=Promise.resolve().then(save);writes.set(candidate,pending);
      try {
        const result=await pending;
        if(scope===candidate&&version===ticket)commit(result);
        return true;
      } finally {if(writes.get(candidate)===pending)writes.delete(candidate);}
    }
  };
}
