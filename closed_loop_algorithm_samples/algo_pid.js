var fs = require('fs');
var request = require("sync-request");
var micro=0.000001;
var obj = {"pid":{"Kp":.00888,"Ti":100,"Td":90},"sim_toggle":{"P":true,"I":true,"D":true},"BGTarget":120,"dt":5.0,"time":1800,"bioavail":6.0,"Vg":253.0,"IRss":1.3,"events":{"bolus":[{ "amt": 0.0, "start": 60 }, { "amt": 0.0, "start": 10 }],"basal":[{ "amt": 1.3, "start": 0,"length":0}],"carb":[{"amt":0.0,"start":600,"length":90},{"amt":0.0,"start":60,"length":90}]}};

function uconvert_basal(u) {
  return u / micro / 60.0;
}

var url='http://localhost:3000/dose';
var urldata='http://localhost:3000/';
var G = []; // glucose in units of mg/dl
var dose=[];
var ID=[]; //units of microU/min
var P=[];
var I=[];
var D=[];
var events=obj.events;
dt = obj.dt;
var time=obj.time; //min - simulation time goes from 0 to time increments of dt
var n = Math.round(time / dt);
var doses={bolus:[],basal:[]};
doses.bolus=new Array(n).fill(0);
doses.basal=new Array(n).fill(0);

ID[0]=obj.IRss/60.0*dt; //this needs to be set by user read from sim data

for (var i = 0; i < events.bolus.length; i++) {
  doses.bolus[Math.round(events.bolus[i].start/dt)]=doses.basal[Math.round(events.bolus[i].start/dt)]+events.bolus[i].amt;
}

for (var i = 0; i < events.basal.length; i++) {
  for(var j=Math.round(events.basal[i].start/dt);j<Math.round((events.basal[i].start+events.basal[i].length)/dt);j++) {
    doses.basal[j]=events.basal[i].amt/60.0*dt; //convert U/hr to U 
  }
}

P[0]=0
I[0]=ID[0]; //bumpless transfer - I0 term is SS basal rate
D[0]=0;
ID[0]=P[0]+I[0]+D[0];

var postdata={dose:ID[0],dt:dt,index:0,time:time,events:events};
G[0]=postID(url,postdata);

for (index = 1; index < n; index++) {
  ID[index]=algo(G,ID,dt,index,doses,P,I,D,obj);
  console.log('index '+index+' ID '+ID[index]);
  postdata.dose=ID[index];
  postdata.index=index;
  G[index]=postID(url,postdata);
}

var pidpost={p:P,i:I,d:D};
var resp=postonly(urldata,pidpost);
console.log("posted algo data to server");

function postID(url,postdata) {
  try{
    var res3 = request('POST', url, {json: postdata});
    var response=JSON.parse(res3.getBody());
    return response.bg;
  }catch(e){
    console.log("post error "+e);
    return false 
  }
}

function postonly(url,postdata) {
  try{
    var res3 = request('POST', url, {json: postdata});
    return JSON.parse(res3.getBody())
  }catch(e){
    console.log("post error "+e);
    return false 
  }
}


function algo(G,ID,dt,index,doses,P,I,D,obj) {
  if(index>1) {var dgdt=(G[index-1]-G[index-2])/dt;} else {var dgdt=0.0}
  P[index]=obj.pid.Kp*(G[index-1]-obj.BGTarget);
  I[index]=I[index-1]+P[index]/obj.pid.Ti;
  D[index]=obj.pid.Kp*obj.pid.Td*dgdt;
  dose=doses.bolus[index]+doses.basal[index];

  if(dt*index>5){
  if (obj.sim_toggle.P==true) {dose=dose+P[index];}
  if (obj.sim_toggle.I==true) {dose=dose+I[index];}
  if (obj.sim_toggle.D==true) {dose=dose+D[index];}}

  if (dose<0) {dose=0.0};
  console.log("P "+P[index]+"I "+I[index]+"D "+D[index])
  console.log("Dose "+dose);
  return dose;
}