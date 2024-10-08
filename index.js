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
const healthRegenRate = 3; //regen 3 health per second
const healthRegenDelay = 5; //regen after 5 seconds of no damage
const maxHealth = 100;



let SERVER_VERSION = '';
try {
    const jsonData = JSON.parse(readFileSync('public/gameVersion.json', 'utf8'));
    if(jsonData.version !== undefined){
        SERVER_VERSION = jsonData.version.toString();
        console.log('🐙 Server version initialized to ' + SERVER_VERSION);
    }
} catch (error) {console.error('error getting server version:', error);}

app.use(express.static(join(__dirname, 'dist')));

app.post('/trigger-server-restart', (req, res) => {
    sendChatMessage('⚠️Stopping server...');
    res.send('Server restart message sent.');
});

let playerData = [];

let updateSinceLastEmit = false;
let lastUpdateSent = 0;
let lastTickTimestamp = Date.now()/1000;
function serverTick(){
    let timeSinceLastTick = Date.now()/1000 - lastTickTimestamp;
    setTimeout(serverTick, 1000/15, '');
    if(!updateSinceLastEmit && Date.now()/1000 - lastUpdateSent < 0.5) return;

    for(let i = 0; i<playerData.length; i++){
        if(playerData[i]['lastDamageTime'] === undefined)
            playerData[i]['lastDamageTime'] = 0;
        if(playerData[i].health < maxHealth && playerData[i]['lastDamageTime'] + healthRegenDelay < Date.now()/1000){
            playerData[i].health += healthRegenRate * timeSinceLastTick;
            if(playerData[i].health > maxHealth)
                playerData[i].health = maxHealth;
        }
    }

    io.emit('remotePlayerData',playerData);
    updateSinceLastEmit = false;
    lastUpdateSent = Date.now()/1000;
    lastTickTimestamp = Date.now()/1000;
}
serverTick();

function periodicCleanup() {
    let currentTime = Date.now() / 1000;
    for (let i = playerData.length - 1; i >= 0; i--) {

        if(playerData[i]['position']['y'] < -150){
            playerData[i]['health'] = 0;
            playerData[i].velocity = {x:0,y:0,z:0};
             sendChatMessage(playerData[i]['name'] + ' fell off :\'(');
             console.log('💔 '+playerData[i]['name'] +'('+ playerData[i].id +') fell off the map');
        }

        //respawn people
        if(playerData[i].health <= 0){
            //console.log('💔 ' + playerData[i]['name'] + '(' + playerData[i].id + ') died');
            // let nameToSend = playerData[i]['name'];
            // sendChatMessage(nameToSend+' died');
            playerData[i].health = 100;
            playerData[i].gravity = 0;
            playerData[i].position = {x:6,y:0.1016,z:12}; //6, 0.1016, 12
            playerData[i].velocity = {x:0,y:0,z:0};
            playerData[i].lookQuaternion = [0,0,0,1];
            playerData[i].forced = true;
        }

        //kick logged out players
        if (playerData[i]['updateTimestamp'] + playerKickTime < currentTime) {
            console.log('🟠 ' + playerData[i]['name'] + '(' + playerData[i].id + ') left');
            let nameToSend = playerData[i]['name'];
            sendChatMessage(nameToSend+' left');
            playerData.splice(i, 1);
        }
    }
}

setInterval(periodicCleanup, 500);



io.on('connection', (socket) => {
    socket.on('playerData',(data) => {
        addPlayerToDataSafe(data,socket);
        if(updateLastInvalidMessageTime){
            lastInvalidMessageTime = Date.now()/1000;
            updateLastInvalidMessageTime = false;
        }
    });

    socket.on('chatMsg',(data) => {
        addChatMessageSafe(data,socket);
    });

    socket.on('latencyTest',() => {
        socket.emit('latencyTest','response :)');
    });

    socket.on('applyDamage',(data)=>{
        let dataError = damageRequestSchema.validate(data).error;
        let dataIsValid = dataError === undefined;
        if(!dataIsValid){
            console.log("⚠️ invalid damage request data received");
            //console.log(dataError)
            return;
        }
        //find target player in playerData by ID of targetPlayer
        let targetPlayerIndex = -1;
        let localPlayerIndex = -1;
        for(let i = 0; i<playerData.length; i++){
            if(playerData[i]['id'] === data.targetPlayer.id)
                targetPlayerIndex = i;
            if(playerData[i]['id'] === data.localPlayer.id)
                localPlayerIndex = i;
        }
        if(targetPlayerIndex === -1){
            console.log('⚠️ target player not found in playerData'); return;
        }
        if(localPlayerIndex === -1){
            console.log('⚠️ local player not found in playerData'); return;
        }
        //check if local player is close enough to the server's position of the local player
        let localPlayerSent = data.localPlayer;
        let localPlayerServer = playerData[localPlayerIndex];
        let localDistance = Math.sqrt(Math.pow(localPlayerSent.position.x - localPlayerServer.position.x,2) + Math.pow(localPlayerSent.position.y - localPlayerServer.position.y,2) + Math.pow(localPlayerSent.position.z - localPlayerServer.position.z,2));
        let targetPlayerSent = data.targetPlayer;
        let targetPlayerServer = playerData[targetPlayerIndex];
        let targetDistance = Math.sqrt(Math.pow(targetPlayerSent.position.x - targetPlayerServer.position.x,2) + Math.pow(targetPlayerSent.position.y - targetPlayerServer.position.y,2) + Math.pow(targetPlayerSent.position.z - targetPlayerServer.position.z,2));

        if(localDistance > 1 || targetDistance > 1){
            console.log('⚠️ client out of sync - name:' + data.localPlayer.name +' latency: ' + Math.floor(data.localPlayer.latency)+ ' localDistance: ' + localDistance + ' targetDistance: ' + targetDistance);
            whisperChatMessage('⚠️ shot not registered (client out of sync)',socket);
            return;
        }

        //apply damage
        playerData[targetPlayerIndex].health -= data.damage;
        playerData[targetPlayerIndex]['lastDamageTime'] = Date.now()/1000;


        if(playerData[targetPlayerIndex].health <= 0){
            let nameOfKilled = playerData[targetPlayerIndex]['name'];
            let nameOfKiller = playerData[localPlayerIndex]['name'];
            sendChatMessage(nameOfKiller+' killed '+nameOfKilled);
            console.log('💔 '+nameOfKiller+' killed '+nameOfKilled);
            periodicCleanup();
        }

    });

    socket.on('disconnect', () => {
        //console.log('browser disconnected 🐙');
    });
});

function addChatMessageSafe(data,socket){
    let dataError = chatMsgSchema.validate(data).error;
    let dataIsValid = dataError === undefined;
    if(!dataIsValid) {
        console.log("⚠️ invalid message data received");
        //console.log(dataError)
        return;
    }
    //TODO: verify ID is in player list
    let isCommand = parseForCommand(data.message,socket);

    if(!isCommand){
        console.log('💬 ' +data.name +':'+ data.message);
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
        case '/ping':
            whisperChatMessage(msg + ' -> pong!', socket);
            break;
            case '/version':
            whisperChatMessage(msg + ' -> Candiru ' + SERVER_VERSION, socket);
            break;
        case '/bee':
            whisperChatMessage(msg + ' -> 🐝 According to all known laws of aviation, there is no way a bee should be able to fly. Its wings are too small to get its fat little body off the ground. The bee, of course, flies anyway because bees don\'t care what humans think is impossible.', socket);
            break;
        case '/clear':
            for(let i = 0; i<25; i++)
                whisperChatMessage('', socket);
            whisperChatMessage(msg+ ' -> chat cleared', socket);
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
            whisperChatMessage('⚠️ Your client is sending invalid data. Try a hard refresh.',socket);
            //console.log(dataError)
            console.log("⚠️ invalid player data received");
            updateLastInvalidMessageTime = true;
        }

        return;
    }
    for(let i = 0; i<playerData.length; i++)
        if(playerData[i]['id'] === data.id){
            if(data['forcedAcknowledged'] === false && playerData[i]['forced'] === true){
                return;
            }
        }
    if(data['forcedAcknowledged'] === true && data['forced'] === true){
        data['forced'] = false;
        console.log('🟢 '+data['name'] +'('+ data.id +') acknowledged force');
    }




    updateSinceLastEmit = true;
    data['updateTimestamp'] = Date.now() / 1000;

    if(data['name'].length<1)
        data['name'] = 'possum' + data['id'];





    for(let i = 0; i<playerData.length; i++)
        if(playerData[i]['id'] === data.id){
            data['health'] = playerData[i]['health'];
            data['lastDamageTime'] = playerData[i]['lastDamageTime'];
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
    acceleration: Joi.number().required(),
    name: Joi.string().required().allow('').max(42),
    gameVersion: Joi.string().required().valid(SERVER_VERSION),
    position: vector3Schema.required(),
    velocity: vector3Schema.required(),
    gravity: Joi.number().required(),
    lookQuaternion: Joi.array().items(Joi.number()).length(4).required(),
    quaternion: Joi.array().items(Joi.number()).length(4).required(),
    chatActive: Joi.boolean().required(),
    chatMsg: Joi.string().required().allow('').max(300),
    latency: Joi.number().required(),
    health: Joi.number().required(),
    forced: Joi.boolean().required(),
    forcedAcknowledged: Joi.boolean().required(),
    updateTimestamp: Joi.number(),
    lastDamageTime: Joi.number(),
});

const chatMsgSchema = Joi.object({
    id: Joi.number().required(),
    name: Joi.string().required().allow('').max(42),
    message: Joi.string().required().allow('').max(300),
});

const damageRequestSchema = Joi.object({
    localPlayer: playerDataSchema.required(),
    targetPlayer: playerDataSchema.required(),
    damage: Joi.number().required(),
});




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
