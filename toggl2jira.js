#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const request = require('request');
const yargs = require('yargs');

var config_file_name = '.toggl2jira.json';
var config_file_fullname = os.homedir() + '/' + config_file_name;

var logged_count = (skipped_count = 0);
var cfg = false;

const argv = yargs
  .usage('Usage: toggle2jira [options]')
  .command({
    command: 'init',
    desc: 'Initialize the .toggl2jira.json configuration file on the user home folder.',
  })
  .option('timespan', {
    alias: 't',
    description: 'Number of days to retrieve time entries from Toggl.',
    type: 'number',
  })
  .option('speed', {
    alias: 's',
    description: 'Print script execution times',
    type: 'boolean',
  })
  .option('verbose', {
    alias: 'v',
    description: 'Print verbose output messages',
    type: 'boolean',
  })
  .help()
  .alias('help', 'h').argv;

// Save the configuration file with the default configuration content
if (argv._.includes('init')) {

  if( fs.existsSync(config_file_fullname) ){
    console.log(`Aborted. \nConfiguration file already exist in ${config_file_fullname}`)
    return;
  }
  fs.copyFile(__dirname + '/.toggl2jira.sample.json', config_file_fullname, (err) => {
    console.log(`Configuration file create in ${config_file_fullname}`);
  });
  return;
}

// Load the configuration file, local, or global.

try {
  cfg = require('./.toggl2jira.json'); //Local config
} catch (e) {
  try {
    cfg = require(os.homedir() + '/.toggl2jira.json'); //Global config
  } catch (e) {
    console.log('Missing configuration file.\n');
    yargs.showHelp();
    return;
  }
}

//Removes any trailing slash on the Jira platform URLs
cfg.jira.united.url = cfg.jira.united.url.replace(/(.*)\/$/, '$1');
cfg.jira.wt.url = cfg.jira.wt.url.replace(/(.*)\/$/, '$1');

var time_entries = {};

//Calculates the time span to retrieve Toggl time entries
var d = new Date();
d.setDate(d.getDate() - (typeof argv.timespan == 'number' ? argv.timespan : cfg.toggl.default_time_span));
d.setHours(0, 0, 0, 0);
var toggl_start_date = d.toISOString();

async function init() {
  var hrstart = process.hrtime(); //Start script execution timer

  time_entries = await get_toogl_time_entries();

  time_entries = time_entries
    .filter((item) => !item.tags || (!item.tags.includes('_logged') && !item.tags.includes('onJira'))) // Filter out entries with the tag "Logged" or "onJira" (this last for back compatibility), as they are already pushed to Jira.
    .filter((item) => item.stop); // Filter out Active entries.

  console.log(`${time_entries.length} time `+ (time_entries.length == 1 ? "entry" : "entries")+ " found.\n");

  if (time_entries.length == 0) {
    return;
  }

  // Preprocess the time entries values
  time_entries.forEach(function (item, index) {
    time_entries[index].issue_id = get_issue_id(item); //Generate the issue_id

    // Removes any issue_id from the description
    time_entries[index].description = item.description ? time_entries[index].description.replace(/^\s*\w+-\d+\s*-?\s*/gim, '') : 'No description';

    // Add custom fields required by internal Jira
    time_entries[index].task_type = 'INTERNAL ACTIVITY'; //Default
    time_entries[index].round = 'InternalActivity'; //Default
  });

  // 4. Push each of them to Jira Timesheets
  var count = 1;
  for (const item of time_entries) {
    if (!item.issue_id) {
      skipped_count++;
        console.log(`Skipped - Missing issue id - ${item.description}`);
      continue;
    }

    var res = await push_to_jira(item, count, time_entries.length);
    if (res) {
      push_to_toggl(item);
    }
    count++;
  }

  console.log(`\n${logged_count} time `+ (logged_count == 1 ? "entry" : "entries") + ` logged. ${skipped_count} time `+ (skipped_count == 1 ? "entry" : "entries") +` skipped.`);

  if (argv.speed || argv.verbose) {
    var hrend = process.hrtime(hrstart);
    console.log('Total execution time: ' + hrend[0] + 's ' + hrend[1] / 1000000 + 'ms');
  }
}

/**
 * 1. Get toggle time entries
 */
function get_toogl_time_entries() {
  return new Promise((resolve, reject) => {
    request.get(
      cfg.toggl.url + '/time_entries?start_date=' + encodeURI(toggl_start_date),
      {
        auth: {
          user: cfg.toggl.api_token,
          pass: 'api_token',
        },
        json: true,
      },
      function (err, httpResponse, body) {
        if (err || httpResponse.statusCode != 200) {
          resolve(false);
          // console.log(httpResponse.statusCode + ' - ' + JSON.stringify(body.errors));
          return;
        }

        resolve(body);
        return;
      }
    );
  });
}

/**
 *  4. Push each of them to Jira Timesheets.
 *     - For 'TaskType' and 'Round' I will define a default value for each based on the Jira issue ID.
 */
function push_to_jira(item, count, total) {
  return new Promise((resolve, reject) => {
    console.log('[' + count + '/' + total + '] - Pushing [' + item.issue_id + '] ' + item.description + ' - ' + item.duration + ' seg');

    var jira_type = (jira_URL = jira_postData = '');

    // Default: United JIRA
    if (item.issue_id.match(/(MMP-\d+|UMP-\d+|INT-24|INT-25).*/)) {
      jira_type = cfg.jira.united.url;
      jira_URL = cfg.jira.united.url + '/rest/tempo-timesheets/3/worklogs/';
      jira_postData = {
        auth: {
          user: cfg.jira.united.usr,
          pass: cfg.jira.united.pwd,
        },
        json: {
          timeSpentSeconds: item.duration,
          dateStarted: item.start,
          comment: item.description, //Remove the Jira issue from the copy
          author: {
            name: cfg.jira.united.usr,
          },
          issue: {
            key: item.issue_id,
          },
          worklogAttributes: [
            {
              key: '_TaskType_',
              value: item.task_type,
            },
            {
              key: '_Round_',
              value: 'InternalActivity',
            },
          ],
        },
      };
    } else {
      // WT Jira
      jira_type = cfg.jira.wt.url;
      jira_URL = cfg.jira.wt.url + '/rest/tempo-timesheets/4/worklogs';
      jira_postData = {
        auth: {
          user: cfg.jira.wt.usr,
          pass: cfg.jira.wt.pwd,
        },
        headers: {
          'X-Atlassian-Token': 'no-check',
          Origin: cfg.jira.wt.url,
        },
        json: {
          timeSpentSeconds: item.duration,
          started: item.start.replace(/(.*)\+\d\d:\d\d$/, '$1.000'), // Date format: 2021-01-28T16:03:00.000
          comment: item.description,
          worker: cfg.jira.wt.worker,
          originTaskId: item.issue_id,
          remainingEstimate: 0,
        },
      };
    }

    request.post(jira_URL, jira_postData, function (err, httpResponse, body) {
      // console.log(httpResponse.statusCode, body);
      if (err || httpResponse.statusCode != 200) {
        skipped_count++;
        console.log(`Skipped! - Issue id not found on Jira (${jira_type})`);
        resolve(false);
        return;
      }
      console.log('Pushed!');
      logged_count++;
      resolve(true);
      return;
    });
  });
}

function push_to_toggl(item) {
  return new Promise((resolve, reject) => {
    request.post(
      cfg.toggl.url + '/time_entries/' + item.id,
      {
        auth: {
          user: cfg.toggl.api_token,
          pass: 'api_token',
        },
        json: {
          time_entry: {
            tags: item.tags ? item.tags.concat('_logged') : ['_logged'],
          },
        },
      },
      function (err, httpResponse, body) {
        if (err || httpResponse.statusCode != 200) {
          // console.log(httpResponse.statusCode + ' - ' + item.issue_id + ' - ' + item.id + ' - ' + item.description + ' - ' + JSON.stringify(body.errors));
          resolve(false);
          return;
        }
        resolve(true);
        return;
      }
    );
  });
}

function get_issue_id(item) {
  var issue_id = false;

  /*
   * Get issue id from description
   *
   * The Issue ID should be included at the start of the toggl item description. Format "[letters]-[numbers]"
   *
   */
  if (item.description && /(\w+-\d+)/gim.test(item.description)) {
    issue_id = item.description.match(/(\w+-\d+)/gim)[0]; // Get issue id from description
  }

  /*
   * Loop user global replacements
   *
   * This replacements change the issue_id based on a regexp on the issue id, or by project id.
   *
   */
  if (issue_id) {
    var id_list = cfg.globalReplacements.issue_id;
    for (const id in id_list) {
      var re = new RegExp(id_list[id], 'gi');
      if (re.test(issue_id)) {
        issue_id = id;
      }
    }
  }

  var pid_list = cfg.globalReplacements.project_id;
  for (const pid in pid_list) {
    var re = new RegExp(pid_list[pid]);
    if (re.test(item.pid)) {
      issue_id = pid;
    }
  }
  return issue_id;
}

init();
