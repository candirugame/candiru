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
            if(nameToSend.length <1)
                nameToSend = 'possum' + playerData[i]['id'];
            sendChatMessage(nameToSend+' left');
            playerData.splice(i, 1);
        }
    }
    setTimeout(() => periodicCleanup(), 5000);
}

periodicCleanup();



io.on('connection', (socket) => {
    socket.on('playerData',(data) => {
        addPlayerToDataSafe(data)
    });

    socket.on('chatMsg',(data) => {
        addChatMessageSafe(data)
    })
    socket.on('disconnect', () => {
        //console.log('browser disconnected 🐙');
    });
});

function addChatMessageSafe(data){
    let dataError = chatMsgSchema.validate(data).error;
    let dataIsValid = dataError === undefined;
    if(!dataIsValid){
        console.log("⚠️ invalid message data received");
        //console.log(dataError)
        return;
    }
    //TODO: verify ID is in player list
    console.log('💬 ' +data.name +':'+ data.message)
    io.emit('chatMsg',data);
}

let lastInvalidMessageTime = 0;
function addPlayerToDataSafe(data){
    let dataError = playerDataSchema.validate(data).error;
    let dataIsValid = dataError === undefined;
    if(!dataIsValid) {
        if(lastInvalidMessageTime + 10 < Date.now()/1000){
            console.log("⚠️ invalid player data received");
            //console.log(dataError)
            lastInvalidMessageTime = Date.now()/1000;
        }

        return;
    }
    updateSinceLastEmit = true;
    data['updateTimestamp'] = Date.now() / 1000;

    for(let i = 0; i<playerData.length; i++)
        if(playerData[i]['id'] === data.id){
            playerData[i] = data;
            return;
        }

    //at this point the player data is valid but not already in the list (new player join)
    playerData.push(data);


    console.log('🟢 '+data['name'] +'('+ data.id +') joined');
    let nameToSend = data['name'];
    if(nameToSend.length <1)
        nameToSend = 'possum' + data['id'];
    sendChatMessage(nameToSend + ' joined');
    //TODO: send player join message to chat

}

const vector3Schema = Joi.object({
    x: Joi.number().required(),
    y: Joi.number().required(),
    z: Joi.number().required(),
});

const quaternionSchema = Joi.object({
    _w: Joi.number().required(),
    _x: Joi.number().required(),
    _y: Joi.number().required(),
    _z: Joi.number().required(),
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