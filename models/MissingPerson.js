import mongoose from 'mongoose';
const schema = new mongoose.Schema({user:{type:mongoose.Schema.Types.ObjectId,ref:'User'},name:{type:String,required:true},age:Number,description:String,lastSeenLocation:{lat:Number,lng:Number,address:String},photoUrl:String,status:{type:String,enum:['Missing','Possible Match','Found','Verified'],default:'Missing'},matchCaseId:mongoose.Schema.Types.ObjectId},{timestamps:true});
export default mongoose.model('MissingPerson',schema);
