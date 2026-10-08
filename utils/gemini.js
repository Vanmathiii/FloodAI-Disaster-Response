export async function analyzeEmergency({message,location,existingCases=[]}){
  if(!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured in backend/.env');
  const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
  const prompt=`You are an emergency-dispatch AI. Analyze this real emergency report. It may be Tamil, Tanglish, English, or mixed. Return ONLY valid JSON matching the schema. Do not invent facts. Report: ${message}\nLocation: ${JSON.stringify(location||{})}\nPossible nearby/duplicate case IDs: ${JSON.stringify(existingCases)}\nSchema: {"emergencyType":"Flood|Medical|Rescue|Missing Person|Fire|Other","priority":"Critical|High|Medium|Low","peopleCount":0,"vulnerablePeople":[],"need":"","summary":"","recommendedAction":"","confidence":0.0,"duplicateCaseIds":[]}`;
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.1,responseMimeType:'application/json'}})});
  const data=await r.json();
  if(!r.ok) throw new Error(data?.error?.message||'Gemini API request failed');
  const text=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  const clean=text.replace(/^```json\s*/,'').replace(/\s*```$/,'').trim();
  return JSON.parse(clean);
}
