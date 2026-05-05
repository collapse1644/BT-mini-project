const Block = require("../core/Block");
const { isValidBlock } = require("./blockValidation");

function isSameGenesis(block) {
  const genesis = Block.genesis();
  return block && block.hash === genesis.hash;
}

function isValidChain(chain) {
  if (!Array.isArray(chain) || chain.length === 0) {
    return false;
  }

  const normalized = chain.map(Block.from);
  if (!isSameGenesis(normalized[0])) {
    return false;
  }

  for (let index = 1; index < normalized.length; index += 1) {
    if (!isValidBlock(normalized[index], normalized[index - 1])) {
      return false;
    }
  }

  return true;
}

module.exports = {
  isValidChain
};
