const WebSockets = require('ws'),
    Mempool = require('./mempool'),
    Blockchain = require('./blockchain');

const { getNewestBlock, isBlockStructureValid, addBlockToChain, replaceChain, getBlockchain, handleIncomingTx } = Blockchain;
const { getMempool } = Mempool;

const sockets = [];

// Message Types
const GET_LATEST = "GET_LATEST";
const GET_ALL = "GET_ALL";
const BLOCKCHAIN_RESPONSE = "BLOCKCHAIN_RESPONSE";
const REQUEST_MEMPOOL = "REQUEST_MEMPOOL";
const MEMPOOL_RESPONSE = "MEMPOOL_RESPONSE";

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
        data
    };
};

const getAllMempool = () => {
    return {
        type: REQUEST_MEMPOOL,
        data: null
    }
};

const mempoolResponse = data => {
    return {
        type: MEMPOOL_RESPONSE,
        data
    }
};

const getSockets = () => sockets;

const startP2PServer = server => {
    const wsServer = new WebSockets.Server({ server });
    wsServer.on('connection', ws => {
        initSocketConnection(ws);
    });
    wsServer.on('error', () => {
        console.log('error');
    })
    console.log('pkimcoin p2p server running');
};

const initSocketConnection = ws => {
    sockets.push(ws);
    handleSocketMessages(ws);
    handleSocketError(ws);
    sendMessage(ws, getLatest());
    setTimeout(() => {
        sendMessageToAll(ws, getAllMempool(), 1000);
    });
    setInterval(() => {
        if (sockets.includes(ws)) {
            sendMessage(ws, '');
        }
    }, 1000);
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
            case REQUEST_MEMPOOL:
                sendMessage(ws, returnMempool());
                break;
            case MEMPOOL_RESPONSE:
                const receivedTxs = message.data;
                if (receivedTxs === null) {
                    return;
                }
                receivedTxs.forEach(tx => {
                    try {
                        handleIncomingTx(tx);
                    } catch(e) {
                        console.log(e);
                    }
                });
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
            if (addBlockToChain(latestBlockReceived)) {
                broadcastNewBlock();
            }
        } else if (receivedBlocks.length === 1) {
            // get all the blocks
            sendMessageToAll(getAll());
        } else {
            replaceChain(receivedBlocks);
        }
    }
};

const returnMempool = () => mempoolResponse(getMempool());

const sendMessage = (ws, message) => ws.send(JSON.stringify(message));

const sendMessageToAll = message => sockets.forEach(ws => sendMessage(ws, message));

const responseLatest = () => blockchainResponse([getNewestBlock()]);

const responseAll = () => blockchainResponse(getBlockchain());

const broadcastNewBlock = () => sendMessageToAll(responseLatest());

const broadcastMempool = () => sendMessageToAll(returnMempool());

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
    ws.on('error', () => {
        console.log('error');
    })
    ws.on('close', () => {
        console.log('close');
    })
};

module.exports = {
    startP2PServer,
    connectToPeers,
    broadcastNewBlock,
    broadcastMempool
};