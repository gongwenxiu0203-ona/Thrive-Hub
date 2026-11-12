export function contractAMClock(now:Date){
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(now).map(p=>[p.type,p.value]));
  return {yearMonth:`${parts.year}-${parts.month}`,date:`${parts.year}-${parts.month}-${parts.day}`,due:parts.day==="05"&&Number(parts.hour)>=9};
}
