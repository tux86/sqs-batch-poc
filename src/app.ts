import {
    APIGatewayProxyEvent,
    APIGatewayProxyResult,
    SQSBatchItemFailure,
    SQSBatchResponse,
    SQSEvent,
} from 'aws-lambda';
import { SendMessageBatchCommandInput, SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs';
import { randomUUID } from 'crypto';

const sqsClient = new SQSClient({
    region: 'eu-west-1',
    maxAttempts: 3,
});

export const consumer = async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchItemFailure[] = [];

    //console.log('event : ', JSON.stringify(event));
    console.log('records count : ', JSON.stringify(event.Records.length));
    for (const record of event.Records) {
        // force to replay all messages
        if (record.body.includes('exception')) {
            throw new Error('Failed processing messageId=' + record.messageId);
        }
        try {
            console.log('messageId : ', record.messageId);
            console.log('message body : ', record.body);
            console.log('message ApproximateReceiveCount : ', record.attributes.ApproximateReceiveCount);
            if (record.body.includes('error')) {
                throw new Error('Failed processing messageId=' + record.messageId);
            }
        } catch (error) {
            console.error('Error ==>', JSON.stringify(error));
            // only failed messages will be replayed
            batchItemFailures.push({
                itemIdentifier: record.messageId,
            });
        }
    }

    console.log('SQSBatchResponse =>', JSON.stringify({ batchItemFailures }));

    return { batchItemFailures };
};

export const producer = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    let response: APIGatewayProxyResult;
    try {
        const input: SendMessageBatchCommandInput = {
            Entries: [
                {
                    Id: randomUUID(),
                    MessageBody: 'message 140', //+ Math.random(),
                    MessageGroupId: 'group_1',
                },
                {
                    Id: randomUUID(),
                    MessageBody: 'message 140 error', //+ Math.random(),  // by adding "error" will simulate consume error
                    MessageGroupId: 'group_1',
                },
            ],
            QueueUrl: process.env.QUEUE_URL,
        };

        const sendMessageBatchCommand: SendMessageBatchCommand = new SendMessageBatchCommand(input);

        const result = await sqsClient.send(sendMessageBatchCommand);
        response = {
            statusCode: 200,
            body: JSON.stringify({
                message: result,
            }),
        };
    } catch (err: unknown) {
        console.log(err);
        response = {
            statusCode: 500,
            body: JSON.stringify({
                message: err instanceof Error ? err.message : 'some error happened',
            }),
        };
    }

    return response;
};
