import type { Prisma, PrismaClient } from "@prisma/client";
import type { SurveySaveInput } from "@surveysim/shared";
import { prisma } from "../lib/db.js";
import { toJson } from "../lib/json.js";

async function persistSurveyGraph(db: PrismaClient | Parameters<Parameters<typeof prisma.$transaction>[0]>[0], surveyId: string, input: SurveySaveInput) {
  const sections: Prisma.SurveySectionCreateManyInput[] = [];
  const questions: Prisma.SurveyQuestionCreateManyInput[] = [];
  const options: Prisma.SurveyOptionCreateManyInput[] = [];

  for (const section of input.schema.sections) {
    sections.push({
      id: section.id,
      surveyId,
      title: section.title,
      description: section.description,
      displayOrder: section.displayOrder,
    });

    for (const question of section.questions) {
      questions.push({
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
      });

      for (const option of question.options) {
        options.push({
          id: option.id,
          questionId: question.id,
          label: option.label,
          value: option.value,
          displayOrder: option.displayOrder,
          allowOther: option.allowOther ?? false,
        });
      }
    }
  }

  if (sections.length > 0) {
    await db.surveySection.createMany({
      data: sections,
    });
  }

  if (questions.length > 0) {
    await db.surveyQuestion.createMany({
      data: questions,
    });
  }

  if (options.length > 0) {
    await db.surveyOption.createMany({
      data: options,
    });
  }
}

const includeSurveyRelations = {
  user: true,
  sections: { orderBy: { displayOrder: "asc" as const } },
  questions: { include: { options: { orderBy: { displayOrder: "asc" as const } } }, orderBy: { displayOrder: "asc" as const } },
};

export const surveyRepository = {
  list(userId: string) {
    return prisma.survey.findMany({
      where: { OR: [{ userId }, { isPublic: true }] },
      include: includeSurveyRelations,
      orderBy: [{ isPublic: "desc" }, { updatedAt: "desc" }],
    });
  },
  listAll() {
    return prisma.survey.findMany({
      include: includeSurveyRelations,
      orderBy: [{ isPublic: "desc" }, { updatedAt: "desc" }],
    });
  },
  async listPage(userId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const where = { OR: [{ userId }, { isPublic: true }] };
    const [items, total] = await prisma.$transaction([
      prisma.survey.findMany({
        where,
        include: includeSurveyRelations,
        orderBy: [{ isPublic: "desc" }, { updatedAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.survey.count({ where }),
    ]);
    return { items, total };
  },
  async listAllPage(page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await prisma.$transaction([
      prisma.survey.findMany({
        include: includeSurveyRelations,
        orderBy: [{ isPublic: "desc" }, { updatedAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.survey.count(),
    ]);
    return { items, total };
  },
  getById(userId: string, id: string) {
    return prisma.survey.findFirst({
      where: { userId, id },
      include: includeSurveyRelations,
    });
  },
  getAnyById(id: string) {
    return prisma.survey.findUnique({
      where: { id },
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
    const surveyId = await prisma.$transaction(async (tx) => {
      const survey = await tx.survey.create({
        data: {
          userId,
          title: input.title,
          description: input.description,
          sourceText: input.rawText,
          respondentInstructions: input.schema.survey.respondentInstructions,
          language: input.schema.survey.language,
          schema: toJson(input.schema),
          isPublic: false,
        },
      });

      await persistSurveyGraph(tx as any, survey.id, input);
      return survey.id;
    });

    return prisma.survey.findUniqueOrThrow({ where: { id: surveyId }, include: includeSurveyRelations });
  },
  async update(userId: string, id: string, input: SurveySaveInput) {
    await prisma.$transaction(async (tx) => {
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
    });

    return prisma.survey.findUniqueOrThrow({ where: { id }, include: includeSurveyRelations });
  },
  delete(userId: string, id: string) {
    return prisma.$transaction(async (tx) => {
      await tx.surveyOption.deleteMany({ where: { question: { surveyId: id } } });
      await tx.surveyQuestion.deleteMany({ where: { surveyId: id } });
      await tx.surveySection.deleteMany({ where: { surveyId: id } });
      return tx.survey.deleteMany({ where: { userId, id } });
    });
  },
  setPublic(id: string, isPublic: boolean) {
    return prisma.survey.update({
      where: { id },
      data: { isPublic },
      include: includeSurveyRelations,
    });
  },
};
