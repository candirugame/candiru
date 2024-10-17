import express from 'npm:express';
import Joi from 'npm:joi';
import { createServer } from 'node:http';
import { Server, Socket } from 'npm:socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

const playerKickTime = 5; // Kick players after 5 seconds of no ping
const healthRegenRate = 3; // Regen 3 health per second
const healthRegenDelay = 5; // Regen after 5 seconds of no damage
const maxHealth = 100;
const baseInventory = [1];

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface RespawnPoint {
  position: Vector3;
  quaternion: Quaternion;
}

interface ItemRespawnPoint {
  position: Vector3;
  itemId: number;
  spawnChancePerTick: number;
}

interface MapData {
  name: string;
  respawnPoints: RespawnPoint[];
  itemRespawnPoints: ItemRespawnPoint[];
}

interface Player {
  id: number;
  speed: number;
  acceleration: number;
  name: string;
  gameVersion: string;
  position: Vector3;
  velocity: Vector3;
  gravity: number;
  lookQuaternion: [number, number, number, number];
  quaternion: [number, number, number, number];
  chatActive: boolean;
  chatMsg: string;
  latency: number;
  health: number;
  forced: boolean;
  forcedAcknowledged: boolean;
  updateTimestamp?: number;
  lastDamageTime?: number;
  inventory: number[];

}

interface ChatMessage {
  id: number;
  name: string;
  message: string;
}

interface DamageRequest {
  localPlayer: Player;
  targetPlayer: Player;
  damage: number;
}

class WorldItem {
  vector: Vector3;
  id: number;
  itemType: number;

  constructor(x: number, y: number, z: number, itemType: number) {
    this.vector = { x, y, z };
    this.id = Math.floor(Math.random() * 100000) + 1;
    this.itemType = itemType;
  }
}

let playerData: Player[] = [];
let worldItemData: WorldItem[] = [new WorldItem(6.12, 0.25, 3.05, 1)];

interface GameVersionData {
  version?: string | number;
}

let SERVER_VERSION = '';
try {
  const jsonData: GameVersionData = JSON.parse(readFileSync('public/gameVersion.json', 'utf8'));
  if (jsonData.version !== undefined) {
    SERVER_VERSION = jsonData.version.toString();
    console.log('🐙 Server version initialized to ' + SERVER_VERSION);
  }
} catch (error) {
  console.error('error getting server version:', error);
}

let mapProperties: MapData | undefined = undefined;
try {
  const jsonData = JSON.parse(readFileSync('public/maps/deathmatch_1/map.json', 'utf8'));
  mapProperties = jsonData;
    console.log('🐙 Map data loaded for ' + jsonData.name);
}
catch (error) {
    console.error('error getting map properties:', error);
}

function getRandomSpawnpoint(): {vec: Vector3, quaternion: Quaternion}{
  if(mapProperties === undefined) return {vec: {x: 2, y: 1, z: 0}, quaternion: {x: 0, y: 0, z: 0, w: 1}};
    let randomIndex = Math.floor(Math.random() * mapProperties.respawnPoints.length);
    return {vec: mapProperties.respawnPoints[randomIndex].position, quaternion: mapProperties.respawnPoints[randomIndex].quaternion};
}



app.use(express.static(join(__dirname, 'dist')));


let lastPlayerTickTimestamp = Date.now() / 1000;
function serverTick() {
  playersTick();
  itemsTick();
}
setInterval(serverTick, 1000 / 15);

let playerUpdateSinceLastEmit = false;
let lastPlayerUpdateSentTimestamp = 0;
function playersTick() {
  const timeSinceLastTick = Date.now() / 1000 - lastPlayerTickTimestamp;
  if (!playerUpdateSinceLastEmit && Date.now() / 1000 - lastPlayerUpdateSentTimestamp < 5) return;

  for (let i = 0; i < playerData.length; i++) {
    // Ensure lastDamageTime is never undefined by using nullish coalescing
    const lastDamageTime = playerData[i].lastDamageTime ?? 0;
    if (playerData[i].health < maxHealth &&
        lastDamageTime + healthRegenDelay < Date.now() / 1000) {
      playerData[i].health += healthRegenRate * timeSinceLastTick;
      if (playerData[i].health > maxHealth) playerData[i].health = maxHealth;
    }
  }

  io.emit('remotePlayerData', playerData);
  playerUpdateSinceLastEmit = false;
  lastPlayerUpdateSentTimestamp = Date.now() / 1000;
  lastPlayerTickTimestamp = Date.now() / 1000;
}

let itemUpdateSinceLastEmit = false;
let lastItemUpdateSentTimestamp = 0;
function itemsTick() {
  checkForPickups();
  if (!itemUpdateSinceLastEmit && Date.now() / 1000 - lastItemUpdateSentTimestamp < 5) return;
  io.emit('worldItemData', worldItemData);
  itemUpdateSinceLastEmit = false;
  lastItemUpdateSentTimestamp = Date.now() / 1000;
}

function checkForPickups() {
  for (let i = 0; i < playerData.length; i++) {
    let itemIndex = worldItemCloseToPoint(
        playerData[i].position.x,
        playerData[i].position.y,
        playerData[i].position.z,
        0.5
    );
    if (itemIndex !== -1) {
      let item = worldItemData[itemIndex];
      if (item.itemType === 1) {
        playerData[i].inventory.push(1);
        worldItemData.splice(itemIndex, 1);
        itemUpdateSinceLastEmit = true;
        console.log('🍌 ' + playerData[i].name + ' picked up banana!');
        sendChatMessage(playerData[i].name + ' picked up banana!');
      }
    }
  }
}

function worldItemCloseToPoint(
    x: number,
    y: number,
    z: number,
    dist: number
): number {
  // Return index of item if close enough, -1 if not
  for (let i = 0; i < worldItemData.length; i++) {
    let distance = Math.sqrt(
        Math.pow(x - worldItemData[i].vector.x, 2) +
        Math.pow(y - worldItemData[i].vector.y, 2) +
        Math.pow(z - worldItemData[i].vector.z, 2)
    );
    if (distance < dist) return i;
  }
  return -1;
}

function periodicCleanup() {
  let currentTime = Date.now() / 1000;
  for (let i = playerData.length - 1; i >= 0; i--) {
    if (playerData[i].position.y < -150) {
      playerData[i].health = 0;
      playerData[i].velocity = { x: 0, y: 0, z: 0 };
      sendChatMessage(playerData[i].name + ' fell off :\'(');
      console.log(
          '💔 ' + playerData[i].name + '(' + playerData[i].id + ') fell off the map'
      );
    }

    // Respawn people
    if (playerData[i].health <= 0) {
        let spawnPoint = getRandomSpawnpoint();
        playerData[i].position = spawnPoint.vec;
        playerData[i].lookQuaternion = [spawnPoint.quaternion.x, spawnPoint.quaternion.y, spawnPoint.quaternion.z, spawnPoint.quaternion.w];
        playerData[i].health = 100;
        playerData[i].gravity = 0;
        playerData[i].velocity = { x: 0, y: 0, z: 0 };
        playerData[i].forced = true;
    }

    // Kick logged-out players
    if ((playerData[i].updateTimestamp || 0) + playerKickTime < currentTime) {
      console.log('🟠 ' + playerData[i].name + '(' + playerData[i].id + ') left');
      let nameToSend = playerData[i].name;
      sendChatMessage(nameToSend + ' left');
      playerData.splice(i, 1);
    }
  }
}

setInterval(periodicCleanup, 500);

io.on('connection', (socket: Socket) => {
  socket.on('playerData', (data: Player) => {
    addPlayerToDataSafe(data, socket);
    if (updateLastInvalidMessageTime) {
      lastInvalidMessageTime = Date.now() / 1000;
      updateLastInvalidMessageTime = false;
    }
  });

  socket.on('chatMsg', (data: ChatMessage) => {
    addChatMessageSafe(data, socket);
  });

  socket.on('latencyTest', () => {
    socket.emit('latencyTest', 'response :)');
  });

  socket.on('applyDamage', (data: DamageRequest) => {
    const { error } = damageRequestSchema.validate(data);
    if (error) {
      console.log('⚠️ invalid damage request data received');
      return;
    }
    // Find target player in playerData by ID of targetPlayer
    let targetPlayerIndex = -1;
    let localPlayerIndex = -1;
    for (let i = 0; i < playerData.length; i++) {
      if (playerData[i].id === data.targetPlayer.id) targetPlayerIndex = i;
      if (playerData[i].id === data.localPlayer.id) localPlayerIndex = i;
    }
    if (targetPlayerIndex === -1) {
      console.log('⚠️ target player not found in playerData');
      return;
    }
    if (localPlayerIndex === -1) {
      console.log('⚠️ local player not found in playerData');
      return;
    }
    // Check if local player is close enough to the server's position of the local player
    let localPlayerSent = data.localPlayer;
    let localPlayerServer = playerData[localPlayerIndex];
    let localDistance = Math.sqrt(
        Math.pow(localPlayerSent.position.x - localPlayerServer.position.x, 2) +
        Math.pow(localPlayerSent.position.y - localPlayerServer.position.y, 2) +
        Math.pow(localPlayerSent.position.z - localPlayerServer.position.z, 2)
    );
    let targetPlayerSent = data.targetPlayer;
    let targetPlayerServer = playerData[targetPlayerIndex];
    let targetDistance = Math.sqrt(
        Math.pow(targetPlayerSent.position.x - targetPlayerServer.position.x, 2) +
        Math.pow(targetPlayerSent.position.y - targetPlayerServer.position.y, 2) +
        Math.pow(targetPlayerSent.position.z - targetPlayerServer.position.z, 2)
    );

    if (localDistance > 1 || targetDistance > 1) {
      console.log(
          '⚠️ client out of sync - name:' +
          data.localPlayer.name +
          ' latency: ' +
          Math.floor(data.localPlayer.latency) +
          ' localDistance: ' +
          localDistance +
          ' targetDistance: ' +
          targetDistance
      );
      whisperChatMessage('⚠️ shot not registered (client out of sync)', socket);
      return;
    }

    // Apply damage
    playerData[targetPlayerIndex].health -= data.damage;
    playerData[targetPlayerIndex].lastDamageTime = Date.now() / 1000;
    playerUpdateSinceLastEmit = true;

    if (playerData[targetPlayerIndex].health <= 0) {
      let nameOfKilled = playerData[targetPlayerIndex].name;
      let nameOfKiller = playerData[localPlayerIndex].name;
      sendChatMessage(nameOfKiller + ' killed ' + nameOfKilled);
      console.log('💔 ' + nameOfKiller + ' killed ' + nameOfKilled);
      periodicCleanup();
    }
  });

  socket.on('disconnect', () => {
    // Handle disconnection if needed
  });
});

function addChatMessageSafe(data: ChatMessage, socket: Socket): void {
  const { error } = chatMsgSchema.validate(data);
  if (error) {
    console.log('⚠️ invalid message data received');
    return;
  }
  // TODO: verify ID is in player list
  let isCommand = parseForCommand(data.message, socket, data.id);

  if (!isCommand) {
    console.log('💬 ' + data.name + ':' + data.message);
    io.emit('chatMsg', data);
  }
}

function parseForCommand(msg: string, socket: Socket, id:number): boolean {
  if (msg.charAt(0) !== '/') return false;

  switch (msg) {
    case '/help':
      whisperChatMessage(msg + ' -> nah i\'m good', socket);
      break;
    case '/kill':
        for (let i = 0; i < playerData.length; i++)
            if (playerData[i].id === id) {
                whisperChatMessage(msg + ' -> killed ' + playerData[i].name, socket);
                sendChatMessage(playerData[i].name + ' killed himself');
                playerData[i].health = 0;
                periodicCleanup();
                playerUpdateSinceLastEmit = true;
                return true;
            }
        break;
    case '/ping':
      whisperChatMessage(msg + ' -> pong!', socket);
      break;
    case '/version':
      whisperChatMessage(msg + ' -> Candiru ' + SERVER_VERSION, socket);
      break;
    case '/bee':
      whisperChatMessage(
          msg +
          ' -> 🐝 According to all known laws of aviation, there is no way a bee should be able to fly. Its wings are too small to get its fat little body off the ground. The bee, of course, flies anyway because bees don\'t care what humans think is impossible.',
          socket
      );
      break;
    case '/clear':
      for (let i = 0; i < 25; i++) whisperChatMessage('', socket);
      whisperChatMessage(msg + ' -> chat cleared', socket);
      break;
    default:
      whisperChatMessage(msg + ' -> unknown command.', socket);
  }

  return true;
}

let updateLastInvalidMessageTime = false;
let lastInvalidMessageTime = 0;
function addPlayerToDataSafe(data: Player, socket: Socket): void {
  const { error } = playerDataSchema.validate(data);
  if (error) {
    if (lastInvalidMessageTime + 2 < Date.now() / 1000) {
      whisperChatMessage(
          '⚠️ Your client is sending invalid data. Try a hard refresh.',
          socket
      );
      console.log('⚠️ invalid player data received');
      updateLastInvalidMessageTime = true;
    }
    return;
  }
  for (let i = 0; i < playerData.length; i++)
    if (playerData[i].id === data.id) {
      if (data.forcedAcknowledged === false && playerData[i].forced === true) {
        return;
      }
    }
  if (data.forcedAcknowledged === true && data.forced === true) {
    data.forced = false;
    console.log('🟢 ' + data.name + '(' + data.id + ') acknowledged force');
  }

  playerUpdateSinceLastEmit = true;
  data.updateTimestamp = Date.now() / 1000;

  if (data.name.length < 1) data.name = 'possum' + data.id;

  for (let i = 0; i < playerData.length; i++)
    if (playerData[i].id === data.id) {
      data.health = playerData[i].health; // Ignore health and inventory from client
      data.inventory = playerData[i].inventory;
      data.lastDamageTime = playerData[i].lastDamageTime;
      playerData[i] = data;
      return;
    }

  // At this point the player data is valid but not already in the list (new player join)
  data.inventory = baseInventory.slice();
  // Set initial position
    let spawnPoint = getRandomSpawnpoint();
    data.position = spawnPoint.vec;
    data.lookQuaternion = [spawnPoint.quaternion.x, spawnPoint.quaternion.y, spawnPoint.quaternion.z, spawnPoint.quaternion.w];
    data.forced = true;

  playerData.push(data);

  console.log('🟢 ' + data.name + '(' + data.id + ') joined');
  let nameToSend = data.name;
  sendChatMessage(nameToSend + ' joined');
  itemUpdateSinceLastEmit = true;
  // TODO: send player join message to chat
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
  inventory: Joi.array().items(Joi.number()).required(),
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

function sendChatMessage(msg: string): void {
  let chatMessage: ChatMessage = {
    message: msg,
    id: -1,
    name: '',
  };
  io.emit('chatMsg', chatMessage);
}

function whisperChatMessage(msg: string, socket: Socket): void {
  let chatMessage: ChatMessage = {
    message: msg,
    id: -1,
    name: '',
  };
  socket.emit('chatMsg', chatMessage);
}
