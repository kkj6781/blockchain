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

CryptoJS = require('Crypto-JS');

const genesisBlock = new Block(0, "3D2C66D87F2C5BE4BA9D0A6A4E140E8C6FAB1EE3E49669D331982DE020AD239F", null, new Date.getTime()/1000, "genesis block");

let blockchain = [genesisBlock];

const getBlockchain = () => blockchain;
const getLastBlock = () => blockchain[blockchain.length - 1];
const getTimestamp = () => new Date.getTime() / 1000;
const createHash = (index, previousHash, timestamp, data) => CryptoJS.SHA256(index + previousHash + timestamp + JSON.stringify(data)).toString();

const createNewBlock = data => {
    const previousBlock = getLastBlock();
    const newBlockIndex = previousBlock.index + 1;
    const newTimestamp = getTimestamp();
    const newHash = createHash(newBlockIndex, previousBlock.hash, newTimestamp, data);
    const newBlock = new Block(newBlockIndex, newHash, previousBlock.hash, newTimestamp, data);
    return newBlock;
};

const getBlockHash = block => createHash(block.index, block,previousHash, block.timestamp, block.data);

const isNewBlockValid = (candidateBlock, latestBlock) => {
    if (!isNewStructureValid(candidateBlock)) {
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
const isNewStructureValid = block => {
    return (
        typeof block.index === 'number' &&
        typeof block.hash === 'string' &&
        typeof block.previousHash === 'string' &&
        typeof block.timestamp === 'number' &&
        typeof block.data === 'string'
    );
};

const isChainValid = candidateChain => {
    const isGenesisValid = block => JSON.stringify(block) === JSON.stringify(genesisBlock);
    if (!isGenesisValid(candidateChain[0])) {
        // different genesis block. sth's wrong
        return false;
    }
    for (let i=1; i < candidateChain.length; i++) {
        if (!isNewBlockValid(candidateChain[i], candidateChain[i-1])) {
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
    if (isNewBlockValid(candidateBlock, getLastBlock())) {
        getBlockchain().push(candidateChain);
        return true;
    } else {
        return false;
    }
}