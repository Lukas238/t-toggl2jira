# t-toggl2jira


This Node.js CLI tool allows to upload [Toggl] time entries into United Airlines account [internal Jira] and/or [UHub.biz Jira] Tempo plugin timesheets automatically.

The script expect each Toggl item to include in the description a target Jira issue id, in the format `[letter]-[number]` (ex.: UMP-1234, MMP-5678, INT-25).

## Use
To log your Toggl time entries to Jira run the command:
```bash
toggl2jira
```

By default, the script will retrieve the las 15 days of Toggl time entries.

You can configure a different default time span on the configuration file.
See the toggl.default_time_span option on the [Configuration](#configuration) section for more information.

## Options

You can run the script and pass a custom time span of days to retrieve Toggl time entries, regardless of the configured default `toggl.default_time_span`, by using the option `-t [number of days]`. In the following example we ask the script to retrieve 30 days worth of Toggl time entries.

```bash
toggl2jira -t 30
```

## Installation

1. To install run the command to install the script globally.
    ```bash
    npm install -g git+ssh://git@bitbucket-ssh.uhub.biz:7999/wunargua/t-toggl2jira.git
    ```
2. Run the initialization command to create the `.toggl2jira.json` configuration file on your user home folder:
    ```bash
    toggl2jira init
    ```
## Configuration

1. Edit the file `.toggl2jira.json` on your user home folder.
2. Fill the required fields with your personal information:
    - `toggl``
        - `api_token`: Is your personal Toggl user API token. You can find/generate it on your Toggl profile page at https://track.toggl.com/profile.
        - `default_time_span`: Is the number of days from today to used to retrieve Toggl time entries. Default: 15 days.
    - `jira.united.usr` and `jira.united.pwd`: Your loging credentials for our internal United Jira.
    - `jira.wt`:
        - `usr` and `pwd`: Your login credentials for WundermanThompson Jira (https://jira.uhub.biz).
        - `worker`: Your Jira user name.
            > This should match your login user, but if your user was created before the merge of Wunderman and JW Thompson agencies, then your user will probably be in the format "name.lastname@wunderman.com"
    - `globalReplacements`: This is a list of Jira issue ids to use in place of the time item issue_id or project id.
    This is helpful if, for example, if you have multiple time entries in your Toggl for different jira tickets, but want to log time on a single _parent_ jira ticket.
        - `issue_id`: Add replace items in the format `"[replace_issue_id]":"[search_issue_id]"`.
        - `project_id`: Add replace items in the format `"[replace_issue_id]":"[search_project_id]"`.
        
### About search string
You can use a plain string or a [regular expression] (without delimiters) as the search string.

In this example we use `UMP-9441` to replace any Toggl time entry with an issue id that matches `WUNARGUADQK-` or `UMP-6502`.

Also we use `UMP-9441` to replace any Toggl time entry with a project id = `156357025`.

``` json
"globalReplacements": {
    "issue_id": {
        "PROJ1-1234": "(?:PROJECT-|PROJ1-5678).*"
    },
    "project_id": {
        "PROJ1-1234": "123567890"
    }
}
```

> You can test new regex on https://regex101.com/.

## Prerequisites
- Node.js ver 11.15.0


[Toggl]: https://toggl.com/
[internal Jira]: http://18.229.78.216/
[Jira]: http://jira.uhub.biz/
[regular expression]: https://regex101.com/
