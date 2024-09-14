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
        console.log('🐙 Server version initialized to \'' + SERVER_VERSION + '\'');
    }
} catch (error) {console.error('error getting server version:', error);}

app.use(express.static(join(__dirname, 'public')));

let playerData = [];

function serverTick(){
    io.emit('remotePlayerData',playerData);

    setTimeout(serverTick, 1000/15, '');
}
serverTick();

function periodicCleanup() {
    let currentTime = Date.now() / 1000;
    for (let i = playerData.length - 1; i >= 0; i--) {
        if (playerData[i]['updateTimestamp'] + playerKickTime < currentTime) {
            console.log('🔴 ' + playerData[i]['name'] + '(' + playerData[i].id + ') left');
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
    socket.on('disconnect', () => {
        //console.log('browser disconnected 🐙');
    });
});

function addPlayerToDataSafe(data){
    let dataError = playerDataSchema.validate(data).error;
    let dataIsValid = dataError === undefined;
    if(!dataIsValid) {
        //console.log(dataError)
        console.log("⚠️ invalid player data received");
        return;
    }

    data['updateTimestamp'] = Date.now() / 1000;

    for(let i = 0; i<playerData.length; i++)
        if(playerData[i]['id'] === data.id){
            playerData[i] = data;
            return;
        }

    //at this point the player data is valid but not already in the list (new player join)
    playerData.push(data);

    console.log('🟢 '+data['name'] +'('+ data.id +') joined');
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
    name: Joi.string().required().allow(''),
    gameVersion: Joi.string().required().valid(SERVER_VERSION),
    position: vector3Schema.required(),
    velocity: vector3Schema.required(),
    //quaternion: quaternionSchema.required(),
    quaternion: Joi.array().items(Joi.number()).length(4).required(),
});





server.listen(3000, () => {
    console.log('🐙 server running at http://localhost:3000');
});
