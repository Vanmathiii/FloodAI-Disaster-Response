import jwt from 'jsonwebtoken';
export function auth(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({message:'Login required'});req.user=jwt.verify(h.slice(7),process.env.JWT_SECRET);next()}catch{return res.status(401).json({message:'Invalid or expired token'})}}
export function admin(req,res,next){if(req.user?.role!=='admin')return res.status(403).json({message:'Admin access required'});next()}
