const cdk = require('aws-cdk-lib');
const { Construct } = require('constructs');
const dynamodb = require('aws-cdk-lib/aws-dynamodb');
const lambda = require('aws-cdk-lib/aws-lambda');
const lambdaNodejs = require('aws-cdk-lib/aws-lambda-nodejs');
const sqs = require('aws-cdk-lib/aws-sqs');
const events = require('aws-cdk-lib/aws-events');
const targets = require('aws-cdk-lib/aws-events-targets');
const logs = require('aws-cdk-lib/aws-logs');
const cloudwatch = require('aws-cdk-lib/aws-cloudwatch');
const secretsmanager = require('aws-cdk-lib/aws-secretsmanager');
const { SqsEventSource } = require('aws-cdk-lib/aws-lambda-event-sources');
const path = require('path');

class DefiPortfolioTrackerStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // ========================================
    // DynamoDB Tables (PROVISIONED for Free Tier)
    // ========================================

    const portfolioPositionsTable = new dynamodb.Table(this, 'PortfolioPositions', {
      tableName: 'PortfolioPositions',
      partitionKey: { name: 'user_address', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'nft_id_type', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: false,
    });

    const watchlistTable = new dynamodb.Table(this, 'Watchlist', {
      tableName: 'Watchlist',
      partitionKey: { name: 'user_address', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: false,
    });

    // ========================================
    // SQS Queues
    // ========================================

    const deadLetterQueue = new sqs.Queue(this, 'EventsDLQ', {
      queueName: 'defi-events-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    const eventsQueue = new sqs.Queue(this, 'EventsQueue', {
      queueName: 'defi-events-queue',
      visibilityTimeout: cdk.Duration.seconds(300),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    // ========================================
    // Secrets Manager - RPC API Key placeholder
    // ========================================

    const rpcApiKeySecret = new secretsmanager.Secret(this, 'RpcApiKeySecret', {
      secretName: 'defi-portfolio-tracker/rpc-api-key',
      description: 'JSON-RPC provider API key (e.g., Infura, Alchemy)',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ apiKey: 'PLACEHOLDER_REPLACE_ME' }),
        generateStringKey: 'unused',
      },
    });

    // ========================================
    // Lambda: IngestPoller
    // ========================================

    const ingestPollerFunction = new lambdaNodejs.NodejsFunction(this, 'IngestPoller', {
      functionName: 'defi-ingest-poller',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/ingest-poller/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        WATCHLIST_TABLE_NAME: watchlistTable.tableName,
        EVENTS_QUEUE_URL: eventsQueue.queueUrl,
        RPC_SECRET_ARN: rpcApiKeySecret.secretArn,
        USE_MOCK_EVENTS: process.env.USE_MOCK_EVENTS || 'true',
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    watchlistTable.grantReadData(ingestPollerFunction);
    watchlistTable.grantWriteData(ingestPollerFunction);
    eventsQueue.grantSendMessages(ingestPollerFunction);
    rpcApiKeySecret.grantRead(ingestPollerFunction);

    // EventBridge schedule: every 5 minutes
    const pollerRule = new events.Rule(this, 'PollerSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      description: 'Trigger IngestPoller every 5 minutes',
    });
    pollerRule.addTarget(new targets.LambdaFunction(ingestPollerFunction));

    // ========================================
    // Lambda: Processor
    // ========================================

    const processorFunction = new lambdaNodejs.NodejsFunction(this, 'Processor', {
      functionName: 'defi-processor',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/processor/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        PORTFOLIO_POSITIONS_TABLE_NAME: portfolioPositionsTable.tableName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    portfolioPositionsTable.grantWriteData(processorFunction);

    processorFunction.addEventSource(
      new SqsEventSource(eventsQueue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
        reportBatchItemFailures: true,
      })
    );

    // ========================================
    // Lambda: ReadApi with Function URL
    // ========================================

    const readApiFunction = new lambdaNodejs.NodejsFunction(this, 'ReadApi', {
      functionName: 'defi-read-api',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/read-api/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        PORTFOLIO_POSITIONS_TABLE_NAME: portfolioPositionsTable.tableName,
        WATCHLIST_TABLE_NAME: watchlistTable.tableName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    portfolioPositionsTable.grantReadData(readApiFunction);
    watchlistTable.grantReadData(readApiFunction);

    const functionUrl = readApiFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.OPTIONS],
        allowedHeaders: ['Content-Type'],
        maxAge: cdk.Duration.hours(24),
      },
    });

    // ========================================
    // CloudWatch Alarms
    // ========================================

    // Alarm on Processor errors
    const processorErrorsAlarm = new cloudwatch.Alarm(this, 'ProcessorErrorsAlarm', {
      metric: processorFunction.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when Processor Lambda has errors',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm on DLQ depth
    const dlqDepthAlarm = new cloudwatch.Alarm(this, 'DLQDepthAlarm', {
      metric: deadLetterQueue.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when messages appear in DLQ',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ========================================
    // Outputs
    // ========================================

    new cdk.CfnOutput(this, 'ReadApiFunctionUrl', {
      value: functionUrl.url,
      description: 'Lambda Function URL for Read API',
      exportName: 'DefiReadApiUrl',
    });

    new cdk.CfnOutput(this, 'ReadApiFunctionArn', {
      value: readApiFunction.functionArn,
      description: 'ARN of the ReadApi Lambda',
    });

    new cdk.CfnOutput(this, 'IngestPollerFunctionArn', {
      value: ingestPollerFunction.functionArn,
      description: 'ARN of the IngestPoller Lambda',
    });

    new cdk.CfnOutput(this, 'ProcessorFunctionArn', {
      value: processorFunction.functionArn,
      description: 'ARN of the Processor Lambda',
    });

    new cdk.CfnOutput(this, 'PortfolioPositionsTableName', {
      value: portfolioPositionsTable.tableName,
      description: 'DynamoDB table for portfolio positions',
    });

    new cdk.CfnOutput(this, 'WatchlistTableName', {
      value: watchlistTable.tableName,
      description: 'DynamoDB table for watchlist',
    });

    new cdk.CfnOutput(this, 'EventsQueueUrl', {
      value: eventsQueue.queueUrl,
      description: 'SQS queue for DeFi events',
    });

    new cdk.CfnOutput(this, 'EventsQueueArn', {
      value: eventsQueue.queueArn,
      description: 'ARN of the events SQS queue',
    });

    new cdk.CfnOutput(this, 'RpcSecretArn', {
      value: rpcApiKeySecret.secretArn,
      description: 'Secrets Manager ARN for RPC API key',
    });
  }
}

module.exports = { DefiPortfolioTrackerStack };
