const CryptoJS = require('crypto-js');

class Block {
    constructor(index, hash, previousHash, timestamp, data) {
        this.index = index;
        this.hash = hash;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
    }
};

// genesis block

const genesisBlock = new Block(0, "B651D03544D7875D8037DAC663068300253621AC34F4A4F491DAD589F86F3CEC", null, 1525098635776, "genesis block");

let blockchain = [genesisBlock];

const getBlockchain = () => blockchain;
const getNewestBlock = () => blockchain[blockchain.length - 1];
const getTimestamp = () => new Date().getTime() / 1000;
const createHash = (index, previousHash, timestamp, data) => CryptoJS.SHA256(index + previousHash + timestamp + JSON.stringify(data)).toString();

const createNewBlock = data => {
    const previousBlock = getNewestBlock();
    const newBlockIndex = previousBlock.index + 1;
    const newTimestamp = getTimestamp();
    const newHash = createHash(newBlockIndex, previousBlock.hash, newTimestamp, data);
    const newBlock = new Block(newBlockIndex, newHash, previousBlock.hash, newTimestamp, data);

    addBlockToChain(newBlock);
    return newBlock;
};

const getBlockHash = block => createHash(block.index, block.previousHash, block.timestamp, block.data);

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
        typeof block.data === 'string'
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

// extend the chain if blockchain's integrity can remain pure
const replaceChain = candidateChain => {
    if (isChainValid(candidateChain) && candidateChain.length > getBlockchain().length) {
        blockchain = candidateChain;
        return true;
    } else {
        return false;
    }
};

const addBlockToChain = candidateBlock => {
    if (isBlockValid(candidateBlock, getNewestBlock())) {
        blockchain.push(candidateBlock);
        return true;
    } else {
        return false;
    }
}

module.exports = {
    getBlockchain,
    createNewBlock,
    getNewestBlock,
    isBlockStructureValid,
    addBlockToChain,
    replaceChain
};