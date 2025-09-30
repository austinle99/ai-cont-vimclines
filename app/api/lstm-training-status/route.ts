import { NextRequest, NextResponse } from 'next/server';
import { LSTMPredictionService } from '@/lib/ml/lstmPredictionService';

// Global service instance
let predictionService: LSTMPredictionService | null = null;

async function getPredictionService(): Promise<LSTMPredictionService> {
  if (!predictionService) {
    predictionService = new LSTMPredictionService();
    await predictionService.initialize();
  }
  return predictionService;
}

export async function GET(req: NextRequest) {
  try {
    const service = await getPredictionService();
    
    const trainingStatus = service.getTrainingStatus();
    const modelInfo = service.getModelInfo();

    return NextResponse.json({
      success: true,
      data: {
        training: trainingStatus,
        model: {
          config: modelInfo.config,
          lastTraining: modelInfo.lastTraining,
          summary: modelInfo.summary
        },
        capabilities: {
          canPredict: !!trainingStatus.lastTrainingDate,
          canRetrain: !trainingStatus.isTraining,
          recommendedAction: getRecommendedAction(trainingStatus)
        }
      }
    });

  } catch (error) {
    console.error('Error getting LSTM training status:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}

function getRecommendedAction(trainingStatus: any): string {
  if (!trainingStatus.lastTrainingDate) {
    return 'train_required';
  }
  
  if (trainingStatus.isTraining) {
    return 'training_in_progress';
  }

  const daysSinceTraining = trainingStatus.lastTrainingDate ? 
    (Date.now() - new Date(trainingStatus.lastTrainingDate).getTime()) / (1000 * 60 * 60 * 24) : 
    Infinity;

  if (daysSinceTraining > 14) {
    return 'retrain_recommended';
  }

  if (trainingStatus.modelPerformance?.testMAPE && trainingStatus.modelPerformance.testMAPE > 20) {
    return 'retrain_for_accuracy';
  }

  return 'ready_for_predictions';
}