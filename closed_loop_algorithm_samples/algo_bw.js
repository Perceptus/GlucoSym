var fs = require('fs');
var request = require("sync-request");
var micro=0.000001;
var obj = {"BGTarget":120,"sens":20,"deltat_v":20,"dia":4,"dt":5.0,"time":600,"bioavail":6.0,"Vg":253.0,"IRss":1.3,"events":{"bolus":[{ "amt": 0.0, "start": 60 }, { "amt": 0.0, "start": 10 }],"basal":[{ "amt": 1.3, "start": 0,"length":600}],"carb":[{"amt":0.0,"start":600,"length":90},{"amt":0.0,"start":60,"length":90}]}};

function uconvert_basal(u) {
  return u / micro / 60.0;
}

var url='http://localhost:3000/dose';
var urldata='http://localhost:3000/';
var G = []; // glucose in units of mg/dl
var dose=[];
var ID=[]; //units of microU/min
var cor=[];
var iob=[];
var corsave=[];
var events=obj.events;
dt = obj.dt;
var time=obj.time; //min - simulation time goes from 0 to time increments of dt
var n = Math.round(time / dt);
var doses={bolus:[],basal:[]};
doses.bolus=new Array(n).fill(0);
doses.basal=new Array(n).fill(0);
corsave=new Array(n).fill(0);

ID[0]=uconvert_basal(obj.IRss); //this needs to be set by user read from sim data

for (var i = 0; i < events.bolus.length; i++) {
  doses.bolus[Math.round(events.bolus[i].start/dt)]=doses.basal[Math.round(events.bolus[i].start/dt)]+events.bolus[i].amt;
}

for (var i = 0; i < events.basal.length; i++) {
  for(var j=Math.round(events.basal[i].start/dt);j<Math.round((events.basal[i].start+events.basal[i].length)/dt);j++) {
    doses.basal[j]=events.basal[i].amt/60.0*dt; //convert to total amount of insulin for the step - U/hr/60min/hr*(step in min)
  }
}

var postdata={dose:ID[0],dt:dt,index:0,time:time,events:events};

for (var index = 0; index < n; index++) {
  if (index==0) {
    postdata.dose=0;
    postdata.index=0;
  } else {
    ID[index]=algo(G,ID,dt,index,doses,cor,corsave,iob,obj);
    console.log('index '+index+' ID '+ID[index]);
    postdata.dose=ID[index];
    postdata.index=index;
  }
  G[index]=postID(url,postdata);
}

var pidpost={correction:corsave,iob:iob};
var resp=postonly(urldata,pidpost);
console.log("posted algo data to server");

for (i=0;i<G.length;i++) {
  console.log(i*dt+","+G[i])
}

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


function algo(G,ID,dt,index,doses,cor,corsave,iob,obj) {
   var dose=0;
   var corcalc=0;

  iob[index]=0;
   for (var i=0;i<cor.length;i++) {
    var ac=actin(obj.dia,dt*index-cor[i].time)/100;
    iob[index]=iob[index]+ac*cor[i].amount;
   }

  if(index>1) {
    var dgdt=(G[index-1]-G[index-2])/dt;
    corcalc=(G[index-1]+dgdt*obj.deltat_v-obj.BGTarget)/obj.sens-iob[index]
  } else {
    var dgdt=0.0;
    corcalc=0;
  };
  
  if (corcalc>0.0) {
    cor.push({time:index*dt,amount:corcalc});
    console.log(cor[cor.length-1]);
  } else {
    corcalc=0.0
  }
  
  corsave[index]=corcalc;
  dose=corcalc;
  dose=dose+doses.bolus[index]+doses.basal[index];
  if (dose<0) {dose=0.0};
  return dose;
}

function actin (idur,m) {
  if (m>idur*60) {
    return 0.0
  } else if (idur==3.5) {
    return -0.0000000560934*Math.pow(m,4) + 0.0000451551*Math.pow(m,3) - 0.00927644*Math.pow(m,2) + 0.0*m + 100.0
  } else if (idur==3) {
    return -3.2e-7*Math.pow(m,4)+1.354e-4*Math.pow(m,3)-1.76e-2*Math.pow(m,2)+9.255e-2*m+99.951
  } else if (idur==4) {
    return -3.31e-8*Math.pow(m,4)+2.53e-5*Math.pow(m,3)-5.51e-3*Math.pow(m,2)-9.086e-2*m+99.95
  } else if (idur==5) {
    return -2.95e-8*Math.pow(m,4)+2.32e-5*Math.pow(m,3)-5.55e-3*Math.pow(m,2)+4.49e-2*m+99.3
  } else if (idur==6) {
    return -1.493e-8*Math.pow(m,4)+1.413e-5*Math.pow(m,3)-4.095e-3*Math.pow(m,2)+6.365e-2*m+99.7
  } else {
    return 1000.0;
  }
}