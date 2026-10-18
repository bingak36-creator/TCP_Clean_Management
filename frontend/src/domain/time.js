export const getKstDateString=(date=new Date())=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
}).format(date);

// SQL LocalDateTime values represent UTC; explicit offsets remain authoritative.
export const parseUtcDate=value=>{
  if(value==null||value==='')return null;
  if(value instanceof Date)return Number.isNaN(value.getTime())?null:value;
  if(typeof value==='number'){const date=new Date(value);return Number.isNaN(date.getTime())?null:date;}
  const text=String(value).trim();
  if(!text)return null;
  const iso=text.replace(' ','T');
  const normalized=/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)?iso:iso+'Z';
  const date=new Date(normalized);return Number.isNaN(date.getTime())?null:date;
};
