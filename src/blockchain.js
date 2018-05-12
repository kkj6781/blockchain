const CryptoJS = require('crypto-js'),
    Wallet = require('./wallet'),
    Transactions = require('./transactions'),
    hexToBinary = require('hex-to-binary');

const { getBalance, getPublicFromWallet } = Wallet;
const { createCoinbaseTx, processTxs } = Transactions;

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

// genesis block

const genesisBlock = new Block(0, "B651D03544D7875D8037DAC663068300253621AC34F4A4F491DAD589F86F3CEC", null, 1525098636, "genesis block", 0, 0);

let blockchain = [genesisBlock];

let uTxOuts = [];

const getBlockchain = () => blockchain;
const getNewestBlock = () => blockchain[blockchain.length - 1];
const getTimestamp = () => Math.round(new Date().getTime() / 1000);
const createHash = (index, previousHash, timestamp, data, difficulty, nonce) => 
    CryptoJS.SHA256(index + previousHash + timestamp + JSON.stringify(data) + difficulty + nonce).toString();

const createNewBlock = () => {
    const coinbaseTx = createCoinbaseTx(getPublicFromWallet(), getNewestBlock().index + 1);
    const blockData = [coinbaseTx];
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
        return false;
    }
    for (let i=1; i < candidateChain.length; i++) {
        if (!isBlockValid(candidateChain[i], candidateChain[i-1])) {
            return false;
        }
    }
    return true;
};

const sumDifficulty = anyBlockchain => anyBlockchain.map(block => block.difficulty)
                                                    .map(diff => Math.pow(2, diff))
                                                    .reduce((a,b) => a + b);

// extend the chain if blockchain's integrity can remain pure
const replaceChain = candidateChain => {
    if (isChainValid(candidateChain) && sumDifficulty(candidateChain) > sumDifficulty(getBlockchain())) {
        blockchain = candidateChain;
        return true;
    } else {
        return false;
    }
};

const addBlockToChain = candidateBlock => {
    if (isBlockValid(candidateBlock, getNewestBlock())) {
        const processedTxs = processTxs(candidateBlock.data, uTxOuts, candidateBlock.index);
        if (processedTxs === null) {
            return false;
        } else {
            blockchain.push(candidateBlock);
            uTxOuts = processedTxs;
            return true;
        }
    } else {
        return false;
    }
}

const getAccountBalance = () => getBalance(getPublicFromWallet(), uTxOuts);

module.exports = {
    getBlockchain,
    createNewBlock,
    getNewestBlock,
    isBlockStructureValid,
    addBlockToChain,
    replaceChain,
    getAccountBalance
};