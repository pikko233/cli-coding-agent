import {
  SUPPORTED_CHAT_MODELS,
  findSupportedChatModel,
  type ModelPricing,
} from "@cli-coding-agent/shared";
import type { LanguageModelUsage } from "ai";

type CalculateCreditsForUsageParams = {
  provider: string;
  model: string;
  usage: LanguageModelUsage;
};

type BillableUsage = {
  credits: number;
};

type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
};

const TOKENS_PER_MILLION = 1_000_000;
// Pikkocode 使用内部 credits 计费，不直接向用户展示模型服务商的价格。
// 当前将 1 credit 设为 0.01 美元，使其像美分一样易于理解，同时也能满足
// 小额 AI 用量所需的计费精度。如果产品需要更精细的单位（如 0.001 美元）
// 或更粗略的单位，可以调整此常量。
const USD_PER_CREDIT = 0.01;

function getTokenCounts(usage: LanguageModelUsage): TokenCounts {
  const inputTokens = usage.inputTokens;
  const outputTokens = usage.outputTokens;

  if (
    inputTokens == null ||
    outputTokens == null ||
    !Number.isFinite(inputTokens) ||
    !Number.isFinite(outputTokens) ||
    !Number.isInteger(inputTokens) ||
    !Number.isInteger(outputTokens) ||
    inputTokens < 0 ||
    outputTokens < 0
  ) {
    throw new Error("计算余额消耗需要输入和输出 token 数量");
  }

  return {
    inputTokens,
    outputTokens,
  };
}

function getModelPricing(provider: string, model: string): ModelPricing {
  const supportedModel = findSupportedChatModel(model);

  if (!supportedModel || supportedModel.provider !== provider) {
    if (
      !SUPPORTED_CHAT_MODELS.some(
        (supportedModel) => supportedModel.provider === provider,
      )
    ) {
      throw new Error(`暂不支持该计费服务商：${provider}`);
    }

    throw new Error(`暂不支持该计费模型：${model}`);
  }

  return supportedModel.pricing;
}

function estimateCostUsd(
  { inputTokens, outputTokens }: TokenCounts,
  pricing: ModelPricing,
) {
  return (
    (inputTokens * pricing.inputUsdPerMillionTokens +
      outputTokens * pricing.outputUsdPerMillionTokens) /
    TOKENS_PER_MILLION
  );
}

function convertUsdToCredits(estimatedCostUsd: number) {
  if (estimatedCostUsd <= 0) {
    return 0;
  }

  // 只要请求产生了费用，就至少扣除 1 credit；不足整数的部分向上取整，
  // 确保最终扣除的 credits 始终为整数。
  return Math.max(1, Math.ceil(estimatedCostUsd / USD_PER_CREDIT));
}

export function calculateCreditsForUsage({
  provider,
  model,
  usage,
}: CalculateCreditsForUsageParams): BillableUsage {
  const tokenCounts = getTokenCounts(usage);
  const pricing = getModelPricing(provider, model);
  const estimatedCostUsd = estimateCostUsd(tokenCounts, pricing);
  const credits = convertUsdToCredits(estimatedCostUsd);

  return {
    credits,
  };
}
