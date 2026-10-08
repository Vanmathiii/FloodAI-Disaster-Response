import mongoose from 'mongoose';
const schema = new mongoose.Schema({name:String,phone:String,team:String,skills:[String],available:{type:Boolean,default:true},location:{lat:Number,lng:Number}},{timestamps:true});
export default mongoose.model('Volunteer',schema);
