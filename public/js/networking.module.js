const socket = io();
async function fetchVersion(){
    try{
        const response = await fetch("gameVersion.json")
        return await response.json();
    }catch(e){console.error(e)}
}

let gameVersion = '';
fetchVersion().then(r => gameVersion = (r['version']));


let lastUploadTime = 0;
const uploadWait = 1; // 1/10 is 10 updates per second
export function updatePlayerData(localPlayer){
    let currentTime = Date.now()/1000;
    if(currentTime - lastUploadTime > uploadWait){
        localPlayer.gameVersion = gameVersion;


        console.log(gameVersion);
        socket.emit('playerData', localPlayer);


        lastUploadTime = currentTime;
    }
}