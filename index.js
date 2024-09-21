import express from 'express';
import Joi from 'joi';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {readFileSync} from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

const playerKickTime = 5; //kick players after 5 seconds of no ping

let SERVER_VERSION = ''
try {
    const jsonData = JSON.parse(readFileSync('public/gameVersion.json', 'utf8'));
    if(jsonData.version !== undefined){
        SERVER_VERSION = jsonData.version.toString();
        console.log('🐙 Server version initialized to ' + SERVER_VERSION);
    }
} catch (error) {console.error('error getting server version:', error);}

app.use(express.static(join(__dirname, 'dist')));

let playerData = [];

let updateSinceLastEmit = false;
let lastUpdateSent = 0;
function serverTick(){
    setTimeout(serverTick, 1000/15, '');
    if(!updateSinceLastEmit && Date.now()/1000 - lastUpdateSent < 5) return;

    io.emit('remotePlayerData',playerData);
    updateSinceLastEmit = false;
    lastUpdateSent = Date.now()/1000;

}
serverTick();

function periodicCleanup() {
    let currentTime = Date.now() / 1000;
    for (let i = playerData.length - 1; i >= 0; i--) {
        if (playerData[i]['updateTimestamp'] + playerKickTime < currentTime) {
            console.log('🟠 ' + playerData[i]['name'] + '(' + playerData[i].id + ') left');
            let nameToSend = playerData[i]['name'];
            sendChatMessage(nameToSend+' left');
            playerData.splice(i, 1);
        }
    }
    setTimeout(() => periodicCleanup(), 5000);
}

periodicCleanup();



io.on('connection', (socket) => {
    socket.on('playerData',(data) => {
        addPlayerToDataSafe(data,socket)
        if(updateLastInvalidMessageTime){
            lastInvalidMessageTime = Date.now()/1000;
            updateLastInvalidMessageTime = false;
        }
    });

    socket.on('chatMsg',(data) => {
        addChatMessageSafe(data,socket)
    })

    socket.on('latencyTest',() => {
        socket.emit('latencyTest','response :)')
    })

    socket.on('disconnect', () => {
        //console.log('browser disconnected 🐙');
    });
});

function addChatMessageSafe(data,socket){
    let dataError = chatMsgSchema.validate(data).error;
    let dataIsValid = dataError === undefined;
    if(!dataIsValid){
        console.log("⚠️ invalid message data received");
        //console.log(dataError)
        return;
    }
    //TODO: verify ID is in player list
    let isCommand = parseForCommand(data.message,socket);

    if(!isCommand){
        console.log('💬 ' +data.name +':'+ data.message)
        io.emit('chatMsg',data);
    }
}

function parseForCommand(msg,socket){
    if(msg.charAt(0) !== '/')
        return false;

    switch (msg) {
        case '/help':
            whisperChatMessage(msg + ' -> nah i\'m good', socket);
            break;
        default:
            whisperChatMessage(msg + ' -> unknown command.', socket);
    }


    return true;
}
let updateLastInvalidMessageTime = false;
let lastInvalidMessageTime = 0;
function addPlayerToDataSafe(data,socket){
    let dataError = playerDataSchema.validate(data).error;
    let dataIsValid = dataError === undefined;
    if(!dataIsValid) {
        if(lastInvalidMessageTime + 2 < Date.now()/1000){
            whisperChatMessage('⚠️ Your client is sending invalid data. Try a hard refresh.',socket)
            //console.log(dataError)
            console.log("⚠️ invalid player data received");
            updateLastInvalidMessageTime = true;
        }

        return;
    }
    updateSinceLastEmit = true;
    data['updateTimestamp'] = Date.now() / 1000;

    if(data['name'].length<1)
        data['name'] = 'possum' + data['id'];

    for(let i = 0; i<playerData.length; i++)
        if(playerData[i]['id'] === data.id){
            playerData[i] = data;
            return;
        }

    //at this point the player data is valid but not already in the list (new player join)
    playerData.push(data);


    console.log('🟢 '+data['name'] +'('+ data.id +') joined');
    let nameToSend = data['name'];
    sendChatMessage(nameToSend + ' joined');
    //TODO: send player join message to chat

}

const vector3Schema = Joi.object({
    x: Joi.number().required(),
    y: Joi.number().required(),
    z: Joi.number().required(),
});


const playerDataSchema = Joi.object({
    id: Joi.number().required(),
    speed: Joi.number().required(),
    name: Joi.string().required().allow(''),
    gameVersion: Joi.string().required().valid(SERVER_VERSION),
    position: vector3Schema.required(),
    velocity: vector3Schema.required(),
    quaternion: Joi.array().items(Joi.number()).length(4).required(),
    chatActive: Joi.boolean().required(),
    chatMsg: Joi.string().required().allow(''),
    latency: Joi.number().required(),
});

const chatMsgSchema = Joi.object({
    id: Joi.number().required(),
    name: Joi.string().required().allow(''),
    message: Joi.string().required().allow(''),
})




server.listen(3000, () => {
    console.log('🐙 server running at http://localhost:3000');
});

function sendChatMessage(msg){
    let chatMessage = {
        message: msg,
        id: -1,
        name: '',
    };
    io.emit('chatMsg',chatMessage);
}

function whisperChatMessage(msg,socket){
    let chatMessage = {
        message: msg,
        id: -1,
        name: '',
    };
    socket.emit('chatMsg',chatMessage);
}