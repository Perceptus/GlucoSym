// // // // // // // // // // // // // // // // // // // // // 
// EXPRESS FRAMEWORK
// // // // // // // // // // // // // // // // // // // // // 
var express = require('express');
var router = express.Router();
var jStat=require('jstat').jStat;

// // // // // // // // // // // // // // // // // // // // // 
//  SIMULATOR VARIABLES
// // // // // // // // // // // // // // // // // // // // // 

// Define Initial Patient Parameters ( Patient A )
var patient_parameters = { 
  "sim_p": { 
    "Si": [],                 // dl/microU   Sensitivity factor array during simulation run
    "bw": 89,                 // KG          Body Weight
    "Ci": 20.1,               // dl/min      Insulin Clearance
    "tau1": 49,               // min         Time constant associated with insulin movement between the SC delivery site and plasma
    "tau2": 47,               // min         Time constant associated with insulin movement between the SC delivery site and plasma
    "Vg": 253,                // dl          Distribution volume in which glucose equilibrates.
    "p2": 0.0106,             // 1/min       Delay in insulin action following an increase in plasma insulin
    "EGP": 1.33,              // mg/dl/min   Endogenous glucose production rate that would be estimated at zero insulin
    "GEZI": 0.0022,           // 1/min       Effect of glucose per se to increase glucose uptake into cells and lower endogenous glucose production at zero insulin
    "Si_base": 0.00000811,    // dl/microU   Baseline Sensitivity Factor ( Initial Sensitivity )
    "bioavail": 6.0,          // ADD UNITS   ADD DESCRIPTION
    "initialglucose": 100     // mg/dl       Simulated patient initial blood glucose level
  }, 
  "dt": 5.0,                  // min         Time between simulator steps
  "time": 2160,               // min         Total simulation run time
  "sens": [ { 
    "per": 100,               // %           Sensitivity variation at point in time. Per is percentage to change at indicated time.
    "start": 0                // min         Sensitivity variation at point in time. Start is start time for variation in minutes.
  } ] 
};    

// Initialize simulator variables
var micro = 0.000001;
var params = { sens:[] };
var ID = [];
var Isc = []; 
var Ip = [];
var Ieff = [];
var Ra = [];
var G = [];
var dt = patient_parameters.dt;
var time = patient_parameters.time;
var sim_p = patient_parameters.sim_p;

// // // // // // // // // // // // // // // // // // // // // 
// SIMULATOR MATH
// // // // // // // // // // // // // // // // // // // // // 

// Each time step, new parameters should be calculated with this function
function simulated_patient_step(sim_p, ID, Ra, dt, index, Isc, Ip, Ieff, G) {
  Iscnew = Isc + dt * (-1.0 / sim_p.tau1 * Isc + 1.0 / sim_p.tau1 * ID / sim_p.Ci);
  Ipnew = Ip + dt * (-1.0 / sim_p.tau2 * Ip + 1.0 / sim_p.tau2 * Isc);
  Ieffnew = Ieff + dt * (-sim_p.p2 * Ieff + sim_p.p2 * sim_p.Si[index] * Ip);
  Gnew = G + dt * (-(sim_p.GEZI + Ieff) * G + sim_p.EGP + Ra/sim_p.Vg);
  return [Iscnew, Ipnew, Ieffnew, Gnew];
}

// This function should get called when adding carbs at the simulation start or during the simulation
function add_carbs(carbs,index) {
  for (var i = 0; i < carbs.length; i++) {
    for(var j=Math.round((carbs[i].start+(index*dt))/dt);j<Math.round(((carbs[i].start+(index*dt))/dt)+(carbs[i].length/dt));j++) {
      Ra[j]=Ra[j]+sim_p.bioavail*sim_p.Vg*carb_absorption((j-index)*dt,carbs[i].amt,carbs[i].length);
    }
  }
}

// This function should get called by add_carbs() to determine the exact amount of carb effect at each step
function carb_absorption(t,amt,AT) {
  if ( t<0 ) {
    return 0.0;
  } else if ( t<AT/2.0 ) {
    return 4*amt*t/(AT*AT);
  } else if ( t<=AT ) {
    return 4*amt*(1-t/AT)/AT;
  } else {
    return 0.0;
  }  
}

// This function should build the complete run statistics to be displayed on the simulator view ( ie http://localhost:3000 )
function simulation_statistics(G) {
  var stats={};
  stats.mean=jStat.mean(G);
  stats.sd=jStat.stdev(G);
  stats.min=jStat.min(G);
  stats.max=jStat.max(G);

  var lowlimit=80.0;
  var highlimit=180.0;
  var lowcount=0;
  var highcount=0;
  var incount=0;
 
  for ( var i=0; i<G.length; i++ ) {
    if ( G[i]<lowlimit ) {
      lowcount++;
    } else if ( G[i]>highlimit ) {
      highcount++;
    } else {
      incount++;      
    }
  }

  stats.inrange=incount/G.length*100.0;
  stats.lowrange=lowcount/G.length*100.0;
  stats.highrange=highcount/G.length*100.0

  return stats
}

// // // // // // // // // // // // // // // // // // // // // 
// SIMULATOR BROWSER ROUTES ( ie http://localhost:3000 )
// // // // // // // // // // // // // // // // // // // // // 

// This should display the simulator UI where you can select & customize a patient.
router.get('/', function(req, res, next) {
  res.render('index', { title: 'GlucoSym', patient_parameters: patient_parameters });
});

// This function should get called at the end of a simulator run to display graphs of the whole run as well as custom data sent by your algorithm. This funciton should also reset the run for a new start.
router.post('/', function(req, res, next) {
  var stats=simulation_statistics(G);
  var IDU=[];
  for (var i=0;i<ID.length;i++){
    IDU[i]=ID[i]*micro*dt;
  }
  var algo_data=req.body;
  var sim_data={Units_per_Step:IDU,ID:ID,time:time,Isc:Isc,Ip:Ip,Ieff:Ieff,G:G,};
  var postdata={sim:sim_data,algo:algo_data,stats:stats};
  res.io.emit("displayGraphs", postdata, stats);
  algo_data = null
  sim_data = null
  res.send({status:"ok"})
});

// This function should be called within the view ( ie http://localhost:3000 ) when selecting a new patient of when updating a patient's parameters
router.post('/update_patient_data', function(req, res, next) {
  patient_parameters = req.body;
  params = { sens:[] };
  ID = [];
  Isc = []; 
  Ip = [];
  Ieff = [];
  Ra = [];
  G = [];
  dt = patient_parameters.dt;
  time = patient_parameters.time;
  sim_p = patient_parameters.sim_p; 
  params.sens = patient_parameters.sens;
  res.send({status:"ok"})
});

// This function should be called from your algorithm as a post request. It should return a resulting blood glucose level.
router.post('/dose', function(request, response, next){  
  
  var post = request.body;
  var index = post.index;
  var time = post.time;
  var dt = post.dt;

  // Convert U from algo to microU/min for sim
  ID[index] = post.dose/micro/dt;

  if (index>0) {

    add_carbs(post.events.carb,index);
    result = simulated_patient_step(sim_p, ID[index], Ra[index], dt, index, Isc[index-1], Ip[index-1], Ieff[index-1], G[index-1]);
    Isc[index]=result[0];
    Ip[index]=result[1];
    Ieff[index]=result[2];
    G[index]=result[3];
    
  } else {

    var events=post.events;
    n = Math.round(time / dt);
    Ra = new Array(n).fill(0);
    add_carbs(events.carb,index);
    sim_p.Si=new Array(n+1).fill(sim_p.Si_base);

    for (var index = 0; index < params.sens.length; index++) {
      for(var j=Math.round(params.sens[index].start/dt);j<n;j++) {
        sim_p.Si[j]=sim_p.Si_base*params.sens[index].per/100.0;
      }
    }

    G[0]=sim_p.initialglucose;
    ID[0]=sim_p.Ci/sim_p.Si_base*(sim_p.EGP/sim_p.initialglucose-sim_p.GEZI);
    Isc[0]=ID[0]/sim_p.Ci;
    Ip[0]=Isc[0];
    Ieff[0]=sim_p.Si_base*Ip[0];
    index=0;

  }

  response.send({bg:G[index]});

});

// // // // // // // // // // // // // // // // // // // // // 
// EXPRESS FRAMEWORK
// // // // // // // // // // // // // // // // // // // // // 
module.exports = router;