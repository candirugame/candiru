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

let SERVER_VERSION = ''
try {
    const jsonData = JSON.parse(readFileSync('public/gameVersion.json', 'utf8'));
    if(jsonData.version !== undefined)
        SERVER_VERSION = jsonData.version;
} catch (error) {console.error('error getting server version:', error);}

app.use(express.static(join(__dirname, 'public')));

let playerData = [];

function serverTick(){
    io.emit('remotePlayerData',playerData);

    setTimeout(serverTick, 1000/15, '');
}
serverTick();

function doSlowCleanup(){


}



io.on('connection', (socket) => {
    console.log('a user connected 🐙');
    socket.on('playerData',(data) => {
        addPlayerToDataSafe(data)
    });
    socket.on('disconnect', () => {
        console.log('user disconnected 🐙');
    });
});

function addPlayerToDataSafe(data){
    let dataError = playerDataSchema.validate(data).error;
    let dataIsValid = dataError === undefined;
    if(!dataIsValid) {
        console.log(dataError)
        return;
    }

    for(let i = 0; i<playerData.length; i++)
        if(playerData[i]['id'] === data.id){
            playerData[i] = data;
            playerData[i]['updateTimestamp'] = Date.now() / 1000;
            return;
        }

    //at this point the player data is valid but not already in the list (new player join)

    playerData.push(data);
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
    name: Joi.string().allow(''),
    gameVersion: Joi.string().required(),
    position: vector3Schema.required(),
    velocity: vector3Schema.required(),
    //quaternion: quaternionSchema.required(),
    quaternion: Joi.array().items(Joi.number()).length(4).required(),
});





server.listen(3000, () => {
    console.log('server running at http://localhost:3000 🐙');
});
