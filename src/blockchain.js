const CryptoJS = require('crypto-js'),
    _ = require('lodash'),
    Wallet = require('./wallet'),
    Mempool = require('./memPool'),
    Transactions = require('./transactions'),
    hexToBinary = require('hex-to-binary');

const { getBalance, getPublicFromWallet, createTx, getPrivateFromWallet } = Wallet;
const { createCoinbaseTx, processTxs } = Transactions;
const { addToMempool, getMempool, updateMempool } = Mempool;

const BLOCK_GENERATION_INTERVAL = 10; // time
const DIFFICULTY_ADJUSTMENT_INTERVAL = 10; // # of blocks

class Block {
    constructor(index, hash, previousHash, timestamp, data, difficulty, nonce) {
        this.index = index;
        this.hash = hash;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.difficulty = difficulty;
        this.nonce = nonce;
    }
};

const genesisTx = {
    txIns: [{ signature: '', txOutId: '', txOutIndex: 0 }],
    txOuts: [
      {
        address:
          "04f20aec39b4c5f79355c053fdaf30410820400bb83ad93dd8ff16834b555e0f6262efba6ea94a87d3c267b5e6aca433ca89b342ac95c40230349ea4bf9caff1ed",
        amount: 50
      }
    ],
    id: "ad67c73cd8e98af6db4ac14cc790664a890286d4b06c6da7ef223aef8c281e76"
};

const genesisBlock = new Block(0, "82a3ecd4e76576fccce9999d560a31c7ad1faff4a3f4c6e7507a227781a8537f", '', 1518512316, [genesisTx], 0, 0);

let blockchain = [genesisBlock];

let uTxOuts = processTxs(blockchain[0].data, [], 0);

const getBlockchain = () => blockchain;
const getNewestBlock = () => blockchain[blockchain.length - 1];
const getTimestamp = () => Math.round(new Date().getTime() / 1000);
const createHash = (index, previousHash, timestamp, data, difficulty, nonce) => 
    CryptoJS.SHA256(index + previousHash + timestamp + JSON.stringify(data) + difficulty + nonce).toString();

const createNewBlock = () => {
    const coinbaseTx = createCoinbaseTx(getPublicFromWallet(), getNewestBlock().index + 1);
    const blockData = [coinbaseTx].concat(getMempool());
    return createNewRawBlock(blockData);
};

const createNewRawBlock = data => {
    const previousBlock = getNewestBlock();
    const newBlockIndex = previousBlock.index + 1;
    const newTimestamp = getTimestamp();
    const difficulty = findDifficulty();
    const newBlock = findBlock(newBlockIndex, previousBlock.hash, newTimestamp, data, difficulty);

    addBlockToChain(newBlock);
    require('./p2p').broadcastNewBlock();
    return newBlock;
};

const findDifficulty = () => {
    const newestBlock = getNewestBlock();
    // every DIFFICULTY_ADJUSTMENT_INTERVAL && not genesis
    if (newestBlock.index % DIFFICULTY_ADJUSTMENT_INTERVAL === 0 && newestBlock.index !== 0) {
        // calculate new difficulty
        return calculateNewDifficulty(newestBlock, getBlockchain());
    } else {
        return newestBlock.difficulty;
    }
};

const calculateNewDifficulty = (newestBlock, blockchain) => {
    const lastCalculatedBlock = blockchain[blockchain.length - DIFFICULTY_ADJUSTMENT_INTERVAL];
    const timeExpected = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;
    const timeTaken = newestBlock.timestamp - lastCalculatedBlock.timestamp;
    if (timeTaken < timeExpected/2) {
        return lastCalculatedBlock.difficulty + 1;
    } else if (timeTaken > timeExpected*2) {
        return lastCalculatedBlock.difficulty - 1;
    } else {
        return lastCalculatedBlock.difficulty;
    }
};

const findBlock = (index, previousHash, timestamp, data, difficulty) => {
    let nonce = 0;
    while (1) {
        const hash = createHash(index, previousHash, timestamp, data, difficulty, nonce);
        // check # of 0's based on difficulty
        if (hashMatchesDifficulty(hash, difficulty)) {
            return new Block(index, hash, previousHash, timestamp, data, difficulty, nonce);
        }
        nonce++;
    }
};

const hashMatchesDifficulty = (hash, difficulty) => {
    const hashInBinary = hexToBinary(hash);
    const requiredZeroes = "0".repeat(difficulty);
    return hashInBinary.startsWith(requiredZeroes);
};

const getBlockHash = block => createHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);

const isTimestampValid = (newBlock, oldBlock) => {
    return (oldBlock.timestamp - 60 < newBlock.timestamp && newBlock.timestamp - 60 < getTimestamp())
};

const isBlockValid = (candidateBlock, latestBlock) => {
    if (!isBlockStructureValid(candidateBlock)) {
        // candidate block doesnt have a valid structure
        return false;
    } else if (latestBlock.index + 1 !== candidateBlock.index) {
        // candidate block doesnt have a valid index
        return false;
    } else if (latestBlock.hash !== candidateBlock.previousHash) {
        // candidate block doesnt have the correct previous hash
        return false;
    } else if (getBlockHash(candidateBlock) !== candidateBlock.hash) {
        // invalid hash
        return false;
    } else if (!isTimestampValid(candidateBlock, latestBlock)) {
        // prevent timestamp attacks
        return false;
    } else {
        return true;
    }
};

// type check
const isBlockStructureValid = block => {
    return (
        typeof block.index === 'number' &&
        typeof block.hash === 'string' &&
        typeof block.previousHash === 'string' &&
        typeof block.timestamp === 'number' &&
        typeof block.data === 'object'
    );
};

const isChainValid = candidateChain => {
    const isGenesisValid = block => {
        return JSON.stringify(block) === JSON.stringify(genesisBlock);
    };
    if (!isGenesisValid(candidateChain[0])) {
        // different genesis block. sth's wrong
        return null;
    }

    let foreignUTxOuts = [];

    for (let i=1; i < candidateChain.length; i++) {
        const currentBlock = candidateChain[i];
        if (i !== 0 && !isBlockValid(currentBlock, candidateChain[i-1])) {
            return null;
        }
        foreignUTxOuts = processTxs(currentBlock.data, foreignUTxOuts, currentBlock.index);
        if (foreignUTxOuts === null) {
            return null;
        }
    }
    return foreignUTxOuts;
};

const sumDifficulty = anyBlockchain => anyBlockchain.map(block => block.difficulty)
                                                    .map(diff => Math.pow(2, diff))
                                                    .reduce((a,b) => a + b);

// extend the chain if blockchain's integrity can remain pure
const replaceChain = candidateChain => {
    const foreignUTxOuts = isChainValid(candidateChain);
    const validChain = foreignUTxOuts !== null;
    if (validChain && sumDifficulty(candidateChain) > sumDifficulty(getBlockchain())) {
        blockchain = candidateChain;
        uTxOuts = foreignUTxOuts;
        updateMempool(uTxOuts);
        require('./p2p').broadcastNewBlock();
        return true;
    } else {
        return false;
    }
};

const addBlockToChain = candidateBlock => {
    if (isBlockValid(candidateBlock, getNewestBlock())) {
        console.log('-1', candidateBlock)
        const processedTxs = processTxs(candidateBlock.data, uTxOuts, candidateBlock.index);
        console.log('-2', processedTxs);
        if (processedTxs === null) {
            return false;
        } else {
            blockchain.push(candidateBlock);
            uTxOuts = processedTxs;
            console.log('uTxOuts ', uTxOuts);            
            updateMempool(uTxOuts);
            return true;
        }
    } else {
        return false;
    }
}

const getUTxOutList = () => _.cloneDeep(uTxOuts);

const getAccountBalance = () => getBalance(getPublicFromWallet(), uTxOuts);

const sendTx = (address, amount) => {
    const tx = createTx(address, amount, getPrivateFromWallet(), getUTxOutList(), getMempool());
    console.log(getMempool());
    addToMempool(tx, getUTxOutList());
    require('./p2p').broadcastMempool();
    return tx;
};

const handleIncomingTx = (tx) => {
    addToMempool(tx, getUTxOutList());
};

module.exports = {
    getBlockchain,
    createNewBlock,
    getNewestBlock,
    isBlockStructureValid,
    addBlockToChain,
    replaceChain,
    getAccountBalance,
    sendTx,
    handleIncomingTx,
    getUTxOutList
};