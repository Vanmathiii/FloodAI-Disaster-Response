import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import {fileURLToPath} from 'url';
import {createServer} from 'http';
import {Server} from 'socket.io';
import User from './models/User.js';
import Emergency from './models/Emergency.js';
import MissingPerson from './models/MissingPerson.js';
import Volunteer from './models/Volunteer.js';
import {auth,admin} from './middleware/auth.js';
import {analyzeEmergency} from './utils/gemini.js';

const __filename=fileURLToPath(import.meta.url), __dirname=path.dirname(__filename);
const app=express(), httpServer=createServer(app), io=new Server(httpServer,{cors:{origin:'*'}});
app.use(cors()); app.use(express.json({limit:'2mb'})); app.use(express.urlencoded({extended:true}));
const uploadDir=path.join(__dirname,'uploads');
const storage=multer.diskStorage({destination:uploadDir,filename:(_r,f,cb)=>cb(null,Date.now()+'-'+f.originalname.replace(/[^a-zA-Z0-9._-]/g,'_'))});
const upload=multer({storage,limits:{fileSize:5*1024*1024}});
app.use('/uploads',express.static(uploadDir)); app.use(express.static(path.join(__dirname,'../frontend')));

function token(u){return jwt.sign({id:u._id.toString(),role:u.role,name:u.name,email:u.email},process.env.JWT_SECRET,{expiresIn:'2d'})}
function safeUser(u){return {id:u._id,name:u.name,email:u.email,role:u.role}}

app.get('/api/health',async(_req,res)=>res.json({ok:true,database:mongoose.connection.readyState===1,aiConfigured:Boolean(process.env.GEMINI_API_KEY)}));
app.post('/api/auth/register',async(req,res)=>{try{const {name,email,password}=req.body;if(!name||!email||!password)return res.status(400).json({message:'Name, email and password are required'});if(password.length<6)return res.status(400).json({message:'Password must be at least 6 characters'});if(await User.findOne({email:email.toLowerCase()}))return res.status(409).json({message:'Email already registered'});const u=await User.create({name,email:email.toLowerCase(),password:await bcrypt.hash(password,10)});res.status(201).json({token:token(u),user:safeUser(u)})}catch(e){res.status(500).json({message:e.message})}});
app.post('/api/auth/login',async(req,res)=>{try{const {email,password}=req.body,u=await User.findOne({email:email?.toLowerCase()});if(!u||!(await bcrypt.compare(password||'',u.password)))return res.status(401).json({message:'Invalid email or password'});res.json({token:token(u),user:safeUser(u)})}catch(e){res.status(500).json({message:e.message})}});

app.post('/api/emergencies',auth,upload.single('image'),async(req,res)=>{try{const {message,language,lat,lng,address}=req.body;if(!message?.trim())return res.status(400).json({message:'Emergency message is required'});const location={lat:Number(lat)||undefined,lng:Number(lng)||undefined,address};const recent=await Emergency.find({createdAt:{$gte:new Date(Date.now()-24*3600000)}}).select('_id message location').limit(50).lean();const ai=await analyzeEmergency({message,location,existingCases:recent.map(x=>x._id.toString())});const e=await Emergency.create({user:req.user.id,message,language,location,imageUrl:req.file?`/uploads/${req.file.filename}`:undefined,ai});const populated=await e.populate('user','name email');io.emit('emergency:new',populated);res.status(201).json(populated)}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/emergencies/mine',auth,async(req,res)=>res.json(await Emergency.find({user:req.user.id}).sort({createdAt:-1}).lean()));
app.get('/api/emergencies',auth,admin,async(req,res)=>res.json(await Emergency.find().populate('user','name email').populate('assignedVolunteer','name phone team').sort({createdAt:-1}).lean()));
app.patch('/api/emergencies/:id/status',auth,admin,async(req,res)=>{const e=await Emergency.findByIdAndUpdate(req.params.id,{status:req.body.status},{new:true}).populate('user','name email').populate('assignedVolunteer','name phone team');if(!e)return res.status(404).json({message:'Case not found'});io.emit('emergency:update',e);res.json(e)});
app.get('/api/dashboard',auth,admin,async(_req,res)=>{const [total,critical,active,resolved,missing,volunteers]=await Promise.all([Emergency.countDocuments(),Emergency.countDocuments({'ai.priority':'Critical'}),Emergency.countDocuments({status:{$nin:['Resolved']}}),Emergency.countDocuments({status:'Resolved'}),MissingPerson.countDocuments({status:{$nin:['Found','Verified']}}),Volunteer.countDocuments({available:true})]);res.json({total,critical,active,resolved,missing,availableVolunteers:volunteers})});

app.post('/api/volunteers',auth,admin,async(req,res)=>res.status(201).json(await Volunteer.create(req.body)));
app.get('/api/volunteers',auth,admin,async(_req,res)=>res.json(await Volunteer.find().sort({available:-1,name:1})));
app.patch('/api/emergencies/:id/assign',auth,admin,async(req,res)=>{const e=await Emergency.findByIdAndUpdate(req.params.id,{assignedVolunteer:req.body.volunteerId,status:'Assigned'},{new:true}).populate('user','name email').populate('assignedVolunteer','name phone team');if(!e)return res.status(404).json({message:'Case not found'});await Volunteer.findByIdAndUpdate(req.body.volunteerId,{available:false});io.emit('emergency:update',e);res.json(e)});

app.post('/api/missing',auth,upload.single('photo'),async(req,res)=>{try{const m=await MissingPerson.create({user:req.user.id,name:req.body.name,age:Number(req.body.age)||undefined,description:req.body.description,lastSeenLocation:{lat:Number(req.body.lat)||undefined,lng:Number(req.body.lng)||undefined,address:req.body.address},photoUrl:req.file?`/uploads/${req.file.filename}`:undefined});io.emit('missing:new',m);res.status(201).json(m)}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/missing/mine',auth,async(req,res)=>res.json(await MissingPerson.find({user:req.user.id}).sort({createdAt:-1})));
app.get('/api/missing',auth,admin,async(_req,res)=>res.json(await MissingPerson.find().populate('user','name email').sort({createdAt:-1})));
app.patch('/api/missing/:id',auth,admin,async(req,res)=>{const m=await MissingPerson.findByIdAndUpdate(req.params.id,{status:req.body.status},{new:true});if(!m)return res.status(404).json({message:'Missing person not found'});io.emit('missing:update',m);res.json(m)});

app.get('/api/me',auth,async(req,res)=>res.json({user:req.user}));
app.get('/',(_req,res)=>res.sendFile(path.join(__dirname,'../frontend/index.html')));
app.use((_req,res)=>res.status(404).json({message:'Route not found'}));

async function start(){try{await mongoose.connect(process.env.MONGODB_URI);console.log('MongoDB connected');const email=process.env.ADMIN_EMAIL?.toLowerCase();if(email&&process.env.ADMIN_PASSWORD){let a=await User.findOne({email});if(!a)await User.create({name:'System Admin',email,password:await bcrypt.hash(process.env.ADMIN_PASSWORD,10),role:'admin'});else if(a.role!=='admin'){a.role='admin';await a.save()}}const port=process.env.PORT||5000;httpServer.listen(port,()=>console.log(`FloodAI running at http://localhost:${port}`))}catch(e){console.error('Startup failed:',e.message);process.exit(1)}}
start();
