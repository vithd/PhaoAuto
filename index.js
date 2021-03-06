// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// index.js is used to setup and configure your bot

// Import required packages
const fs = require('fs');
const path = require('path');
const restify = require('restify');
const sprintf = require('sprintf-js').sprintf;

// Import required bot services. See https://aka.ms/bot-services to learn more about the different parts of a bot.
const { BotFrameworkAdapter } = require('botbuilder');

// This bot's main dialog.
const { ProactiveBot } = require('./bots/proactiveBot');

// Note: Ensure you have a .env file and include the MicrosoftAppId and MicrosoftAppPassword.
const ENV_FILE = path.join(__dirname, '.env');
require('dotenv').config({ path: ENV_FILE });

// Create adapter.
// See https://aka.ms/about-bot-adapter to learn more about adapters.
const adapter = new BotFrameworkAdapter({
    appId: 'e0c075de-b966-4350-aac2-0f415c219d01',
    appPassword: '.Fw-8/wV]PA3kB6rL2[MPxvU=MV3bo=L'
});

// Catch-all for errors.
adapter.onTurnError = async (context, error) => {
    // This check writes out errors to console log
    // NOTE: In production environment, you should consider logging this to Azure
    //       application insights.
    console.error(`\n [onTurnError]: ${ error }`);
    // Send a message to the user
    await context.sendActivity(`Ui! Em bị lỗi rồi >_<"`);
};

// Create the main dialog.
const conversationReferences = {};
const bot = new ProactiveBot(conversationReferences, adapter);

// Create HTTP server.
let server = null;
if (process.env.local) {
    server = restify.createServer();
} else {
    server = restify.createServer({
        key: fs.readFileSync('/etc/letsencrypt/live/tungnt8.com/privkey.pem'),
        certificate: fs.readFileSync('/etc/letsencrypt/live/tungnt8.com/fullchain.pem')
    });
}
server.listen(process.env.port || process.env.PORT || 8401, function() {
    console.log(`\n${ server.name } listening to ${ server.url }`);
    // console.log(`\nGet Bot Framework Emulator: https://aka.ms/botframework-emulator`);
});

// Listen for incoming activities and route them to your bot main dialog.
server.post('/api/messages', (req, res) => {
    adapter.processActivity(req, res, async (turnContext) => {
        // route to main dialog.
        await bot.run(turnContext);
    });
});

// Listen for incoming notifications and send proactive messages to users.
server.use(restify.plugins.bodyParser());

server.get('/chat', async (req, res) => {
    


    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.writeHead(200);
    res.write(sprintf(chatHTML, getLog(), bot.groupConversationReference ? 'OK' : 'Unset'));
    res.end();
});

server.post('/chat', async (req, res) => {
    
    if (bot.groupConversationReference && req.body.chat) {
        console.log(req.body);
        await adapter.continueConversation(bot.groupConversationReference, async turnContext => {
            await turnContext.sendActivity(req.body.chat);
        });
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.writeHead(200);
    res.write(sprintf(chatHTML, getLog(), bot.groupConversationReference ? 'OK' : 'Unset'));
    res.end();
});

function getLog() {
    try {
        const numberOfLines = 20;
        let logs = [];
        var data = fs.readFileSync('/root/.pm2/logs/index-out.log', 'utf8');
        var lines = data.split("\n");

        for (let i = lines.length - numberOfLines; i < lines.length; i++) {
            logs.push(lines[i]);
        }
    
        return logs.join('\n');
    } catch (e) {
        console.log(e);
        return 'Unable to get Log';
    }
}

const chatHTML = `<html>
<head>
<meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, height=device-height, initial-scale=1.0, minimum-scale=1.0">
    <style>
        body {
            display: flex;
            justify-content: center;
            align-items: center;
            background: #e67664;
        }

        form {
            max-width: 600px;
        }

        #chat {
            width: 100%%;
            display: block;
            margin-bottom: 16px;
            height: 40px;
            border: 1px dashed #d43a3add;
            padding: 5px 8px;
        }

        pre {
            max-width: 100%%;
            max-height: 80vh;
            overflow: auto;
        }

        button {
            height: 30px;
        }

        #send {
            float: right;
        }
    </style>
</head>
<body>
<form action="/chat" method="POST">
    <pre>%s</pre>

    <label>Group connection: %s</label>
    <input type="text" name="chat" id="chat" value="" placeholder="Type a message here" autocomplete="off" autofocus>
    <button onclick="location.reload()">Reload</button>
    <button id="send" type="submit">Send</button>
</form>
</body>
</html>`;