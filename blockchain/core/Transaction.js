const crypto = require("crypto");

class Transaction {
  constructor({ id, type = "speedrun", payload, timestamp = Date.now(), submitter = "anonymous" }) {
    this.type = type;
    this.payload = payload;
    this.timestamp = timestamp;
    this.submitter = submitter;
    this.id = id || Transaction.calculateHash({ type, payload, timestamp, submitter });
  }

  static calculateHash({ type, payload, timestamp, submitter }) {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify({ type, payload, timestamp, submitter }))
      .digest("hex");
  }

  static from(data) {
    return new Transaction(data);
  }
}

module.exports = Transaction;
