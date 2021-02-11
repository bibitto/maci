jest.setTimeout(1200000)
import * as fs from 'fs'
import { 
    genWitness,
    getSignalByName,
} from './utils'

import {
    MaciState,
    STATE_TREE_DEPTH,
} from 'maci-core'

import {
    Keypair,
    Command,
    Message,
    VerifyingKey,
    StateLeaf,
    Ballot,
} from 'maci-domainobjs'

import {
    hashLeftRight,
    G1Point,
    G2Point,
    IncrementalQuinTree,
    stringifyBigInts,
} from 'maci-crypto'

const voiceCreditBalance = BigInt(100)

const duration = 30
const maxValues = {
    maxUsers: 25,
    maxMessages: 25,
    maxVoteOptions: 25,
}

const treeDepths = {
    intStateTreeDepth: 1,
    messageTreeDepth: 2,
    messageTreeSubDepth: 1,
    voteOptionTreeDepth: 2,
}

const messageBatchSize = 5

const testProcessVk = new VerifyingKey(
    new G1Point(BigInt(0), BigInt(1)),
    new G2Point([BigInt(0), BigInt(0)], [BigInt(1), BigInt(1)]),
    new G2Point([BigInt(3), BigInt(0)], [BigInt(1), BigInt(1)]),
    new G2Point([BigInt(4), BigInt(0)], [BigInt(1), BigInt(1)]),
    [
        new G1Point(BigInt(5), BigInt(1)),
        new G1Point(BigInt(6), BigInt(1)),
    ],
)

const testTallyVk = new VerifyingKey(
    new G1Point(BigInt(2), BigInt(3)),
    new G2Point([BigInt(3), BigInt(0)], [BigInt(3), BigInt(1)]),
    new G2Point([BigInt(4), BigInt(0)], [BigInt(3), BigInt(1)]),
    new G2Point([BigInt(5), BigInt(0)], [BigInt(4), BigInt(1)]),
    [
        new G1Point(BigInt(6), BigInt(1)),
        new G1Point(BigInt(7), BigInt(1)),
    ],
)

const coordinatorKeypair = new Keypair()
const circuit = 'tallyVotes_test'

describe('TallyVotes circuit', () => {
    describe('1 user, 2 messages', () => {
        const maciState = new MaciState()
        const voteWeight = BigInt(9)
        const voteOptionIndex = BigInt(0)
        let stateIndex
        let pollId
        let poll
        const messages: Message[] = []
        const commands: Command[] = []
        let messageTree

        beforeAll(async () => {
            const userKeypair = new Keypair()
            stateIndex = maciState.signUp(userKeypair.pubKey, voiceCreditBalance)

            maciState.stateAq.mergeSubRoots(0)
            maciState.stateAq.merge(STATE_TREE_DEPTH)

            // Sign up and publish
            pollId = maciState.deployPoll(
                duration,
                maxValues,
                treeDepths,
                messageBatchSize,
                coordinatorKeypair,
                testProcessVk,
                testTallyVk,
            )

            poll = maciState.polls[pollId]

            messageTree = new IncrementalQuinTree(
                treeDepths.messageTreeDepth,
                poll.messageAq.zeroValue,
            )

            // First command (valid)
            const command = new Command(
                stateIndex,
                userKeypair.pubKey,
                voteOptionIndex, // voteOptionIndex,
                voteWeight, // vote weight
                BigInt(2), // nonce
                BigInt(pollId),
            )

            const signature = command.sign(userKeypair.privKey)

            const ecdhKeypair = new Keypair()
            const sharedKey = Keypair.genEcdhSharedKey(
                ecdhKeypair.privKey,
                coordinatorKeypair.pubKey,
            )
            const message = command.encrypt(signature, sharedKey)
            messages.push(message)
            commands.push(command)
            messageTree.insert(message.hash())

            poll.publishMessage(message, ecdhKeypair.pubKey)

            // Second command (valid)
            const command2 = new Command(
                stateIndex,
                userKeypair.pubKey,
                voteOptionIndex, // voteOptionIndex,
                BigInt(1), // vote weight
                BigInt(1), // nonce
                BigInt(pollId),
            )
            const signature2 = command2.sign(userKeypair.privKey)

            const ecdhKeypair2 = new Keypair()
            const sharedKey2 = Keypair.genEcdhSharedKey(
                ecdhKeypair2.privKey,
                coordinatorKeypair.pubKey,
            )
            const message2 = command2.encrypt(signature2, sharedKey2)
            messages.push(message2)
            commands.push(command2)
            messageTree.insert(message2.hash())
            poll.publishMessage(message2, ecdhKeypair2.pubKey)

            poll.messageAq.mergeSubRoots(0)
            poll.messageAq.merge(treeDepths.messageTreeDepth)

            expect(messageTree.root.toString())
                .toEqual(
                    poll.messageAq.getRoot(
                        treeDepths.messageTreeDepth,
                    ).toString()
                )
            // Process messages
            const gi = poll.processMessages()

            // The new roots, which should differ
            const newStateRoot = poll.stateTree.root
            const newBallotRoot = poll.ballotTree.root
        })

        it('should produce the correct result commitments', async () => {
            const currentResultsCommitment = poll.genResultsCommitment()
            const generatedInputs = poll.tallyVotes()

            const newResultsCommitment = poll.genResultsCommitment()
            expect(currentResultsCommitment.toString()).not.toEqual(newResultsCommitment.toString())

            debugger

            const witness = await genWitness(circuit, generatedInputs)
            expect(witness.length > 0).toBeTruthy()

            //const circuitNewResultsCommitment =
                //await getSignalByName(circuit, witness, 'main.newResultsCommitment')

            //expect(circuitNewResultsCommitment).toEqual(newResultsCommitment.toString())
        })
    })

    //const NUM_BATCHES = 2
    //describe(`1 user, ${messageBatchSize * NUM_BATCHES} messages`, () => {
        //it('should produce the correct state root and ballot root', async () => {
            //const maciState = new MaciState()
            //const userKeypair = new Keypair()
            //const stateIndex = maciState.signUp(userKeypair.pubKey, voiceCreditBalance)

            //maciState.stateAq.mergeSubRoots(0)
            //maciState.stateAq.merge(STATE_TREE_DEPTH)
            //// Sign up and publish
            //const pollId = maciState.deployPoll(
                //duration,
                //maxValues,
                //treeDepths,
                //messageBatchSize,
                //coordinatorKeypair,
                //testProcessVk,
                //testTallyVk,
            //)

            //const poll = maciState.polls[pollId]

            //const numMessages = messageBatchSize * NUM_BATCHES
            //for (let i = 0; i < numMessages; i ++) {
                //const command = new Command(
                    //stateIndex,
                    //userKeypair.pubKey,
                    //BigInt(i), //vote option index
                    //BigInt(1), // vote weight
                    //BigInt(numMessages - i), // nonce
                    //BigInt(pollId),
                //)

                //const signature = command.sign(userKeypair.privKey)

                //const ecdhKeypair = new Keypair()
                //const sharedKey = Keypair.genEcdhSharedKey(
                    //ecdhKeypair.privKey,
                    //coordinatorKeypair.pubKey,
                //)
                //const message = command.encrypt(signature, sharedKey)
                //poll.publishMessage(message, ecdhKeypair.pubKey)
            //}

            //poll.messageAq.mergeSubRoots(0)
            //poll.messageAq.merge(treeDepths.messageTreeDepth)

            //const generatedInputs: any[] = []
            ////for (let i = 0; i < NUM_BATCHES; i ++) {
            //for (let i = 0; i < 1; i ++) {
                //const circuitInputs = poll.processMessages()
                //generatedInputs.push(circuitInputs)

                ////const witness = await genWitness(circuit, circuitInputs)
                ////expect(witness.length > 0).toBeTruthy()
            //}
            ////TODO
        //})
    //})
})
