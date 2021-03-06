var express = require('express');
var router = express.Router();
var moment = require('moment');
var util = require("util");

var Type = require('type-of-is');

var google = require('googleapis');
var adsense = google.adsense('v1.4');

require('array.prototype.find');

var UserProfile = require('../models.js').UserProfile;
var Earning = require('../models.js').Earning;

// INIT GOOGLE API
var OAuth2 = google.auth.OAuth2;

 // info from the app, need to be moved to constants file or to DB
var CLIENT_ID = "619973237257-ud5ujht6btm8njnfq6v158sm27abr5nn.apps.googleusercontent.com";
var CLIENT_SECRET = "O-b4w10_tnK96SUG9tpdDYxS";

var config = require('config');
var google_oauth_redirect_url = config.get('google.oauth_callback_url');

var oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, google_oauth_redirect_url);

// default email to store and retrieve Google tokens (until we implement user logins and profiles)
var email = 'nicolas.daudin@gmail.com';

var GoogleBiz = function(){

	var generateAuthUrl = function(callback){
		console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' Google OAUTH START');
		

		// generate a url that asks permissions for Google+ and Google Calendar scopes
		var scopes = [
		  'https://www.googleapis.com/auth/adsense'	  
		];

		var url = oauth2Client.generateAuthUrl({
			access_type: 'offline', // 'online' (default) or 'offline' (gets refresh_token)
	  		scope: scopes // If you only need one scope you can pass it as string
		})

		console.log('Google OAuth url generated : ' + url);
		callback(url);
	};

	var oauth2Callback = function(authCode,callback){
	
		console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' Start Google OAUTH CALLBACK');
		
		console.log('Google OAUTH code authorization : ' + authCode);

		oauth2Client.getToken(authCode, function(err, token){
			if (!err){
				console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' Google Token is : ' + JSON.stringify(token));

				oauth2Client.setCredentials({
					access_token: token.access_token,
					refresh_token : token.refresh_token
				});

				// finding the correct UserProfile
				UserProfile.findOne({email:email},function(err, userprofile){
					if (err){
						console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' Error while retrieving user profile: '  + err);
					}

					console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' userprofile found : '  + JSON.stringify(userprofile)); 

					var googleInfo = userprofile.google;
					console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' googleInfo before the change: '  + JSON.stringify(googleInfo));
					googleInfo.access_token = token.access_token;
					if (token.refresh_token){
						googleInfo.refresh_token = token.refresh_token;
					}

					console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' googleInfo after the change: '  + JSON.stringify(googleInfo));
					userprofile.update({google: googleInfo},function(err,result, raw){
						if (err){
							console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' Error when storing Google info: '  + err);
						} else {
							console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' Result of update: '  + result);
							//console.log('The raw response from Mongo was ', raw);
						}
					});

					callback();
					

				});

			}
		})

		console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' End Google OAUTH CALLBACK');
	};

	var getAdsenseReport = function(callback){
		console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' Start Google REPORT');		

		// looking for credentials
		UserProfile.find({email:email},function(err,profiles){
			if (err){
				console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' Error while retrieving User Profile: ' + err);
			}

			console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' User profile: ' + JSON.stringify(profiles));	
			console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' User with Google credentials : ' + JSON.stringify(profiles[0].google));		
			
			// only get access and refresh
			var credentials = {
				access_token : profiles[0].google.access_token,
				refresh_token : profiles[0].google.refresh_token
			}

			oauth2Client.setCredentials(credentials);
			//https://developers.google.com/accounts/docs/OAuth2WebServer

			console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' OAuth2Client : ' + JSON.stringify(oauth2Client));		
			
			// account id should already be known. When a user will create his profile, and connect to adsense, we will get this information back
			// and store it upon integration with his Adsense.
			// adsense.accounts.list({auth:oauth2Client}, function(err,response){ ......response.items[0].id }) should be used
			var accountId = profiles[0].google.adsense_id;
			console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' accountId : ' + accountId);		
			
			// data retrieval strategy:
			// I retrieve everything from DB, except 'today'

			// at the moment, I try to retrieve 'yesterday' from DB, and if it's not, I also take it from Google's result
			// TODO: 'yesterday' should be retrieved by the cron during the night, so here it should be retrieved in DB
			var today = {
				start 	:  	moment().format('YYYY-MM-DD'),
				end 	: 	moment().format('YYYY-MM-DD')
			}

			var yesterday = {
				start 	:  	moment().subtract(1,'day').format('YYYY-MM-DD'),
				end 	: 	moment().subtract(1,'day').format('YYYY-MM-DD')
			}

			var two_days_ago = {
				start 	:  	moment().subtract(2,'day').format('YYYY-MM-DD'),
				end 	: 	moment().subtract(2,'day').format('YYYY-MM-DD')
			}

			var current_month = {
				start :  moment().startOf('month').format('YYYY-MM-DD'),
				end : moment().format('YYYY-MM-DD')
			}

			var reportParams = {
				accountId : accountId,
				auth : oauth2Client,
				startDate: current_month.start,
				endDate: current_month.end,
				dimension:'DATE',
				metric:'EARNINGS'
			}

			//https://developers.google.com/adsense/management/v1.4/reference/reports/generate
			// ==> try (after 0:00 am in France i.e. 18pm in Mexico) to add useTimezoneReporting=true

			adsense.accounts.reports.generate(reportParams, function(errReport,response){
				if (errReport){
					console.log('Error while getting report: ' + errReport);
					console.log('Error while getting report: ' + JSON.stringify(errReport));
				} else {				
					console.log('Google Reports Response JSON: ' + JSON.stringify(response));

					console.log('Google Reports Rows : ' + response.rows);
					
					var todayValue = response.rows.find(function(a) { return a[0] === today.start;})
					/*if (todayValue){
						// if the check is dont at 03:00 AM Europe time, Google is still at 'yesterday' 
						// (Google Adsense reports are on Pacific Time (PST))
						console.log('Google Report Todays earnings: ' + todayValue[1]);
					} else {
						todayValue[1] = 0;

					}*/
					console.log('Google Report Todays earnings: ' + todayValue[1]);

					var yesterdayValue = response.rows.find(function(a) { return a[0] === yesterday.start;})
					console.log('Google Report Yesterdays earnings : ' + yesterdayValue[1]);

					var twoDaysAgoValue = response.rows.find(function(a) { return a[0] === two_days_ago.start;})
					console.log('Google Report Two Days Ago earnings : ' + twoDaysAgoValue[1]);

					var monthValue = response.totals[1];
					console.log('Google Report Total Months earnings : ' + monthValue);

					callback({
						today: todayValue[1],
						yesterday: yesterdayValue[1],
						two_days_ago: twoDaysAgoValue[1],
						current_month: monthValue
					});
				}
			});
		})

		console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' End Google REPORT');

		
	};

	/**
	* @param day date of the report, format YYYY-MM-DD, ex moment().subtract(1,'day').format('YYYY-MM-DD')
	* @return json { day : <income> } with income the amount of money earned that day
	*/
	var getAdsenseReportOneDay = function(day,callback){
		console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' Start Google REPORT for DAY ' + day);		

		// looking for credentials
		UserProfile.find({email:email},function(err,profiles){
			if (err){
				console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' Error while retrieving User Profile: ' + err);
			}

			console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' User profile: ' + JSON.stringify(profiles));	
			console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' User with Google credentials : ' + JSON.stringify(profiles[0].google));		
			
			// only get access and refresh
			var credentials = {
				access_token : profiles[0].google.access_token,
				refresh_token : profiles[0].google.refresh_token
			}

			oauth2Client.setCredentials(credentials);
			//https://developers.google.com/accounts/docs/OAuth2WebServer

			console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' OAuth2Client : ' + JSON.stringify(oauth2Client));		
			
			// account id should already be known. When a user will create his profile, and connect to adsense, we will get this information back
			// and store it upon integration with his Adsense.
			// adsense.accounts.list({auth:oauth2Client}, function(err,response){ ......response.items[0].id }) should be used
			var accountId = profiles[0].google.adsense_id;
			console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' accountId : ' + accountId);		
			
			// data retrieval strategy:
			// I query Google directly.

			var reportParams = {
				accountId : accountId,
				auth : oauth2Client,
				startDate: day,
				endDate: day,
				dimension:'DATE',
				metric:'EARNINGS'
			}

			adsense.accounts.reports.generate(reportParams, function(errReport,response){
				if (errReport){
					console.log('Error while getting report: ' + errReport);
					console.log('Error while getting report: ' + JSON.stringify(errReport));
				} else {				
					console.log('Google Reports Response JSON: ' + JSON.stringify(response));

					console.log('Google Reports Rows : ' + response.rows);
					
					var earning = response.rows.find(function(a) { return a[0] === day;})
					console.log('Google Report earnings for day ' + day + ' : ' + earning[1]);

					callback({
						day: earning[1]
					});
				}
			});
		})

		console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' End Google REPORT for DAY ' + day);	

		
	};

	/**
	* @param day date of the report, format YYYY-MM-DD, ex moment().subtract(1,'day').format('YYYY-MM-DD')
	* @return json { day : <income> } with income the amount of money earned that day
	*/
	var getAdsenseReportSeveralDays = function(day_begin, day_end,callback){
		console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' Start Google REPORT for DAYS between ' + day_begin + ' and ' + day_end);		

		// looking for credentials
		UserProfile.find({email:email},function(err,profiles){
			if (err){
				console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' Error while retrieving User Profile: ' + err);
			}

			console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' User profile: ' + JSON.stringify(profiles));	
			console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' User with Google credentials : ' + JSON.stringify(profiles[0].google));		
			
			// only get access and refresh
			var credentials = {
				access_token : profiles[0].google.access_token,
				refresh_token : profiles[0].google.refresh_token
			}

			oauth2Client.setCredentials(credentials);
			//https://developers.google.com/accounts/docs/OAuth2WebServer

			console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' OAuth2Client : ' + JSON.stringify(oauth2Client));		
			
			// account id should already be known. When a user will create his profile, and connect to adsense, we will get this information back
			// and store it upon integration with his Adsense.
			// adsense.accounts.list({auth:oauth2Client}, function(err,response){ ......response.items[0].id }) should be used
			var accountId = profiles[0].google.adsense_id;
			console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' accountId : ' + accountId);		
			
			// data retrieval strategy:
			// I query Google directly.

			var reportParams = {
				accountId : accountId,
				auth : oauth2Client,
				startDate: day_begin,
				endDate: day_end,
				dimension:'DATE',
				metric:'EARNINGS'
			}

			adsense.accounts.reports.generate(reportParams, function(errReport,response){
				if (errReport){
					console.log('Error while getting report: ' + errReport);
					console.log('Error while getting report: ' + JSON.stringify(errReport));
				} else {				
					//console.log('Google Reports Response JSON: ' + JSON.stringify(response));

					//console.log('Google Reports Rows : ' + response.rows);
					
					//var earning = response.rows.find(function(a) { return a[0] === day;})
					//console.log('Google Report earnings for day ' + day + ' : ' + earning[1]);

					callback(response.rows);
				}
			});
		})

		console.log(moment().format('YYYY-MM-DD HH:mm:ss') + ' End Google REPORT for DAYS between ' + day_begin + ' and ' + day_end);		

		
	};


	var saveEarning = function(email,date,amount){

		// inserting in table Earning
		Earning.create({
			email	:   email,
			source	:   "google",
			date 	:   date,
			quantity  : amount
		}, function(err,earning){
			if (err){
				console.log('Error while inserting GOOGLE Earning:' + err);
			} else {
				console.log('GOOGLE Earning of amount['+amount+'] for date['+date+'] inserted !!!!!');
			}
		});
	};

	var findEarning = function(email,date, callback){
		Earning.find({email:email,source:"google",date:date},function(err,earning){			
			if (err || !earning || earning.length == 0){
				//console.log('GOOGLE No earning found for day:' + date);
				callback();
			} else {
				//console.log('GOOGLE Earning found : ' + JSON.stringify(earning));
				//console.log('GOOGLE Earning of amount['+earning[0].quantity+'] for date['+date+'] found !');
				callback(earning[0]);
			}
		})
	};

	return {
		generateAuthUrl: generateAuthUrl,
		oauth2Callback: oauth2Callback,
		getAdsenseReport: getAdsenseReport,
		getAdsenseReportOneDay : getAdsenseReportOneDay,
		saveEarning : saveEarning,
		findEarning : findEarning,
		getAdsenseReportSeveralDays : getAdsenseReportSeveralDays

	}; 

}

module.exports.GoogleBiz = GoogleBiz;

