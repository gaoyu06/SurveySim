import type { PrismaClient } from "@prisma/client";
import type { SurveySaveInput } from "@surveysim/shared";
import { prisma } from "../lib/db.js";
import { toJson } from "../lib/json.js";

async function persistSurveyGraph(db: PrismaClient | Parameters<Parameters<typeof prisma.$transaction>[0]>[0], surveyId: string, input: SurveySaveInput) {
  for (const section of input.schema.sections) {
    await db.surveySection.create({
      data: {
        id: section.id,
        surveyId,
        title: section.title,
        description: section.description,
        displayOrder: section.displayOrder,
      },
    });

    for (const question of section.questions) {
      await db.surveyQuestion.create({
        data: {
          id: question.id,
          surveyId,
          sectionId: section.id,
          code: question.code,
          type: question.type,
          title: question.title,
          description: question.description,
          required: question.required,
          respondentInstructions: question.respondentInstructions,
          validation: question.validation ? toJson(question.validation) : undefined,
          displayOrder: question.displayOrder,
        },
      });

      for (const option of question.options) {
        await db.surveyOption.create({
          data: {
            id: option.id,
            questionId: question.id,
            label: option.label,
            value: option.value,
            displayOrder: option.displayOrder,
            allowOther: option.allowOther ?? false,
          },
        });
      }
    }
  }
}

const includeSurveyRelations = {
  sections: { orderBy: { displayOrder: "asc" as const } },
  questions: { include: { options: { orderBy: { displayOrder: "asc" as const } } }, orderBy: { displayOrder: "asc" as const } },
};

export const surveyRepository = {
  list(userId: string) {
    return prisma.survey.findMany({
      where: { userId },
      include: includeSurveyRelations,
      orderBy: { updatedAt: "desc" },
    });
  },
  getById(userId: string, id: string) {
    return prisma.survey.findFirst({
      where: { userId, id },
      include: includeSurveyRelations,
    });
  },
  countReferencingRuns(userId: string, id: string) {
    return prisma.mockRun.count({
      where: {
        userId,
        surveyId: id,
      },
    });
  },
  async create(userId: string, input: SurveySaveInput) {
    return prisma.$transaction(async (tx) => {
      const survey = await tx.survey.create({
        data: {
          userId,
          title: input.title,
          description: input.description,
          sourceText: input.rawText,
          respondentInstructions: input.schema.survey.respondentInstructions,
          language: input.schema.survey.language,
          schema: toJson(input.schema),
        },
      });

      await persistSurveyGraph(tx as any, survey.id, input);
      return tx.survey.findUniqueOrThrow({ where: { id: survey.id }, include: includeSurveyRelations });
    });
  },
  async update(userId: string, id: string, input: SurveySaveInput) {
    return prisma.$transaction(async (tx) => {
      await tx.surveyOption.deleteMany({ where: { question: { surveyId: id } } });
      await tx.surveyQuestion.deleteMany({ where: { surveyId: id } });
      await tx.surveySection.deleteMany({ where: { surveyId: id } });

      await tx.survey.update({
        where: { id },
        data: {
          userId,
          title: input.title,
          description: input.description,
          sourceText: input.rawText,
          respondentInstructions: input.schema.survey.respondentInstructions,
          language: input.schema.survey.language,
          schema: toJson(input.schema),
        },
      });

      await persistSurveyGraph(tx as any, id, input);
      return tx.survey.findUniqueOrThrow({ where: { id }, include: includeSurveyRelations });
    });
  },
  delete(userId: string, id: string) {
    return prisma.$transaction(async (tx) => {
      await tx.surveyOption.deleteMany({ where: { question: { surveyId: id } } });
      await tx.surveyQuestion.deleteMany({ where: { surveyId: id } });
      await tx.surveySection.deleteMany({ where: { surveyId: id } });
      return tx.survey.deleteMany({ where: { userId, id } });
    });
  },
};
