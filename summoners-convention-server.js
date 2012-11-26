var connect = require('connect');
var WebSocketServer = require('websocket').server;
var SummonersConvention = require('./summoners-convention.js').SummonersConvention;
var Summoning = require('./summoning.js').Summoning;

var server = connect.createServer(connect.static(__dirname)).listen(8080);
var wsServer = new WebSocketServer({httpServer: server});

var latestTimeoutId = undefined;

var SETUP_SECONDS = 5;

var players = [];
var playerNumberSequence = 1;

wsServer.on('request', function(request) {
    var connection = request.accept();
    var playerId = getConnectionId(connection);
    connection.playerId = playerId;
    var playerNumber = playerNumberSequence++;
    var player = {playerNumber: playerNumber, connection: connection, playerId: playerId, name: "Player " + playerNumber, energy: 45, golemConfig: getBaseGolemConfig()};
    connection.sendUTF(JSON.stringify({event: 'connected', name: player.name, playerNumber: playerNumber, energy: player.energy}));
    messagePlayers({event:'playerJoined', name: player.name, playerNumber: playerNumber});
    players.push(player);
    connection.sendUTF(JSON.stringify({event: 'playersList', players: players.map(function(e){return {name:e.name,playerNumber:e.playerNumber};})}));
    
    if(typeof latestTimeoutId === 'undefined' && players.length >= 2){
        latestTimeoutId = setTimeout(start, 0);
    }
    
    connection.on('message', function(message) {
        try{
            var data = JSON.parse(message.utf8Data);
            socketEventHandler(this.playerId, data);
        } catch (e){
            console.warn('Unable to parse socket event: ' + message.utf8Data + '\n' + e);
        }
    });
    connection.on('close', function(reasonCode, description) {
        var disconnectingPlayer = getPlayerById(this.playerId);
        messagePlayers({event:'playerLeft', name: disconnectingPlayer.name, playerNumber: disconnectingPlayer.playerNumber});
        players = players.filter(function(player){return player.playerId !== disconnectingPlayer.playerId;});
    });
});

function messagePlayers(message){
    var text = JSON.stringify(message);
    //console.log(text);
    players.forEach(function(player){player.connection.sendUTF(text);});
}

function start(){
    messagePlayers({event: 'countdown-begin'});
    setTimeout(countdown, 0);
}

function countdown(secondsLeft){
    secondsLeft = secondsLeft || SETUP_SECONDS;
    messagePlayers({event: 'countdown', second: secondsLeft});
    secondsLeft--;
    if(secondsLeft > 0){
        setTimeout(function(){countdown(secondsLeft);}, 1000);
    } else {
        var summonersConvention = new SummonersConvention(players, conventionEventHandler);
        setTimeout(summonersConvention.convene, 1000);
    }
}

function end(){
    if(players.length >= 2){
        latestTimeoutId = setTimeout(start, 1000);
    } else {
        latestTimeoutId = undefined;
    }    
}

var conventionEventHandler = function(data){
    switch(data.event){
    case 'convention-end':
        end();
        break;
    }

    messagePlayers(data);
};

var socketEventHandler = function(aPlayerId, data){
    switch(data.event){
    case 'nameChange':
        nameChange(aPlayerId, data);
        break;
    case 'golemConfigChange':
        golemConfigChange(aPlayerId, data);
        break;
    default:
        console.warn('Unkown event: ' + JSON.stringify(data));
    }
};

function golemConfigChange(aPlayerId, golemConfigChangeData) {
    var golemConfig = JSON.parse(JSON.stringify(golemConfigChangeData));
    golemConfig.event = undefined;
    getPlayerById(aPlayerId).golemConfig = golemConfig;
}

function nameChange(aPlayerId, nameChangeData) {
    var player = getPlayerById(aPlayerId);
    player.name = nameChangeData.name;
    messagePlayers({event: 'nameChange', name: player.name, playerNumber: player.playerNumber});
}

function getConnectionId(aConnection){
    return aConnection.socket.remoteAddress + ":" + aConnection.socket.remotePort;
}

function getBaseGolemConfig() {
    return {material: 'Straw', attack: 'Base', abilities: []};
}

function getPlayerById(aPlayerId){
    return players.filter(function(player){return player.playerId === aPlayerId;})[0];
}