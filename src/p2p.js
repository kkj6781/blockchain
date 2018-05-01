const WebSockets = require('ws'),
    Blockchain = require('./blockchain');

const { getNewestBlock, isBlockStructureValid, addBlockToChain, replaceChain, getBlockchain } = Blockchain;

const sockets = [];

// Message Types
const GET_LATEST = "GET_LATEST";
const GET_ALL = "GET_ALL";
const BLOCKCHAIN_RESPONSE = "BLOCKCHAIN_RESPONSE";

// Message Creators
const getLatest = () => {
    return {
        type: GET_LATEST,
        data: null
    };
};

const getAll = () => {
    return {
        type: GET_ALL,
        data: null
    };
};

const blockchainResponse = (data) => {
    return {
        type: BLOCKCHAIN_RESPONSE,
        data: data
    };
;}

const getSockets = () => sockets;

const startP2PServer = server => {
    const wsServer = new WebSockets.Server({ server });
    wsServer.on('connection', ws => {
        initSocketConnection(ws);
    });
    console.log('pkimcoin p2p server running');
};

const initSocketConnection = ws => {
    sockets.push(ws);
    handleSocketMessages(ws);
    handleSocketError(ws);
    sendMessage(ws, getLatest());
};

const parseData = data => {
    try {
        return JSON.parse(data);
    } catch (e) {
        console.log(e);
        return null;
    }
}

const handleSocketMessages = ws => {
    ws.on('message', data => {
        const message = parseData(data);
        if (message === null) {
            return;
        }
        console.log(message);
        switch(message.type) {
            case GET_LATEST:
                sendMessage(ws, responseLatest());
                break;
            case GET_ALL:
                sendMessage(ws, responseAll());
                break;
            case BLOCKCHAIN_RESPONSE:
                const receivedBlocks = message.data;
                if (receivedBlocks === null) {
                    break;
                }
                handleBlockchainResponse(receivedBlocks);
                break;
        }
    });
};

const handleBlockchainResponse = receivedBlocks => {
    if (!receivedBlocks.length) {
        console.log('received blocks have a length of 0');
        return
    }
    const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    if (!isBlockStructureValid(latestBlockReceived)) {
        console.log('invalid block received');
        return;
    }
    const newestBlock = getNewestBlock();
    if (latestBlockReceived.index > newestBlock.index) {
        // received a blockchain that's ahead of us
        if (latestBlockReceived.previousHash === newestBlock.hash) {
            // one block ahead
            addBlockToChain(latestBlockReceived);
        } else if (receivedBlocks.length === 1) {
            // get all the blocks
            sendMessageToAll(getAll());
        } else {
            replaceChain(receivedBlocks);
        }
    }
};

const sendMessage = (ws, message) => ws.send(JSON.stringify(message));

const sendMessageToAll = message => sockets.forEach(ws => sendMessage(ws, message));

const responseLatest = () => blockchainResponse([getNewestBlock()]);

const responseAll = () => blockchainResponse(getBlockchain());

const handleSocketError = ws => {
    const closeSocketConnection = ws => {
        ws.close();
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeSocketConnection(ws));
    ws.on('error', () => closeSocketConnection(ws));    
}

const connectToPeers = newPeer => {
    const ws = new WebSockets(newPeer);
    ws.on('open', () => {
        initSocketConnection(ws);
    });
};

module.exports = {
    startP2PServer,
    connectToPeers
};