-- 生物题库数据 (474道题)
-- 导入命令: psql -U postgres -d exam_system -f biology-data.sql

-- 单选题 (124道)
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('植物进行光合作用的主要场所是？', 'A', '单选', 1, '["A. 叶绿体","B. 线粒体","C. 细胞核","D. 液泡"]', '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体内氧气和二氧化碳交换的场所是？', 'B', '单选', 1, '["A. 气管","B. 肺泡","C. 心脏","D. 血液"]', '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('植物通过什么结构吸收水分和无机盐？', 'B', '单选', 1, '["A. 叶片","B. 根尖","C. 茎","D. 花"]', '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体最大的消化腺是？', 'B', '单选', 1, '["A. 胰腺","B. 肝脏","C. 唾液腺","D. 胃腺"]', '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('细胞分裂过程中，变化最明显的是？', 'D', '单选', 1, '["A. 细胞膜","B. 细胞质","C. 细胞核","D. 染色体"]', '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体形成尿液的器官是？', 'A', '单选', 1, '["A. 肾脏","B. 输尿管","C. 膀胱","D. 尿道"]', '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('被子植物双受精后，受精卵发育成？', 'A', '单选', 2, '["A. 胚","B. 胚乳","C. 种皮","D. 果实"]', '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体血液循环的动力器官是？', 'C', '单选', 1, '["A. 动脉","B. 静脉","C. 心脏","D. 毛细血管"]', '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('下列属于生态系统的是？', 'A', '单选', 1, '["A. 一片森林","B. 森林中所有生物","C. 森林中所有树木","D. 森林中所有土壤"]', '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体中枢神经系统的组成包括？', 'B', '单选', 1, '["A. 脑和脑神经","B. 脑和脊髓","C. 脊髓和脊神经","D. 脑神经和脊神经"]', '', '生物');

-- 判断题 (100道)
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('植物只在白天进行光合作用。', '√', '判断', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体内静脉血含氧量低，呈暗红色。', '√', '判断', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('所有细菌都是对人类有害的。', '×', '判断', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('细胞是生物体结构和功能的基本单位。', '√', '判断', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('动脉血一定在动脉中流动。', '×', '判断', 2, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('植物通过蒸腾作用参与生物圈的水循环。', '√', '判断', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体内最大的细胞是卵细胞。', '√', '判断', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('种子萌发需要阳光。', '×', '判断', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体内的胰岛素分泌不足会导致糖尿病。', '√', '判断', 2, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('植物呼吸作用只在夜间进行。', '×', '判断', 1, NULL, '', '生物');

-- 填空题 (100道)
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('生物体结构和功能的基本单位是__________。', '细胞', '填空', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('植物进行光合作用的场所是__________。', '叶绿体', '填空', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体呼吸系统的主要器官是__________。', '肺', '填空', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('血液由__________和血细胞组成。', '血浆', '填空', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('种子萌发需要的内部条件是__________。', '完整的、有活力的胚', '填空', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体内消化食物和吸收营养的主要场所是__________。', '小肠', '填空', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('植物运输水分和无机盐的管道是__________。', '导管', '填空', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体神经系统结构和功能的基本单位是__________。', '神经元', '填空', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('生物分类的最基本单位是__________。', '种', '填空', 1, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体内形成尿液的器官是__________。', '肾脏', '填空', 1, NULL, '', '生物');

-- 多选题 (50道)
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('下列哪些结构属于植物细胞，而动物细胞没有？', 'ACD', '多选', 2, '["A. 细胞壁","B. 线粒体","C. 叶绿体","D. 液泡"]', '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体的以下系统中，哪些直接参与内环境稳态的维持？', 'ABCD', '多选', 2, '["A. 循环系统","B. 消化系统","C. 呼吸系统","D. 泌尿系统"]', '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('下列哪些是种子萌发所需的外界条件？', 'ABC', '多选', 2, '["A. 适宜的温度","B. 充足的空气","C. 一定的水分","D. 肥沃的土壤"]', '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('关于人体心脏的叙述，正确的有？', 'ABCD', '多选', 2, '["A. 有四个腔室","B. 左心室壁最厚","C. 心房与心室之间有瓣膜","D. 是血液循环的动力器官"]', '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('下列哪些生物在生态系统中通常扮演消费者的角色？', 'ACD', '多选', 2, '["A. 兔子","B. 蘑菇","C. 狼","D. 麻雀"]', '', '生物');

-- 简答题 (100道)
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('简述光合作用的概念和意义。', '光合作用是绿色植物通过叶绿体，利用光能，把二氧化碳和水转化成储存着能量的有机物（如淀粉），并且释放出氧气的过程。意义：①为植物自身提供有机物和能量；②为其他生物提供食物来源；③维持大气中氧气和二氧化碳的平衡。', '简答', 2, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('人体消化系统由哪些器官组成？并简述食物的消化过程。', '消化系统由消化道和消化腺组成。消化道包括口腔、咽、食道、胃、小肠、大肠、肛门；消化腺包括唾液腺、胃腺、肝脏、胰腺、肠腺。食物在口腔中被初步消化（淀粉），在胃中初步消化蛋白质，在小肠中被彻底消化为葡萄糖、氨基酸、甘油和脂肪酸等可吸收物质，最终进入循环系统。', '简答', 2, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('简述呼吸运动的原理。', '呼吸运动包括吸气和呼气两个过程。吸气时，肋间肌和膈肌收缩，胸廓容积扩大，肺内气压下降，外界气体进入肺；呼气时，肋间肌和膈肌舒张，胸廓容积缩小，肺内气压升高，肺内气体排出。', '简答', 2, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('什么是反射？反射弧包括哪些部分？', '反射是指人体通过神经系统对外界或内部的各种刺激所发生的有规律的反应。反射弧包括感受器、传入神经、神经中枢、传出神经和效应器五个部分。', '简答', 2, NULL, '', '生物');
INSERT INTO question_bank (question, answer, type, difficulty, options, explanation, subject) VALUES ('简述植物蒸腾作用的意义。', '①降低植物叶片表面的温度，避免灼伤；②促进根吸收水分；③促进水分和无机盐在植物体内的运输。', '简答', 2, NULL, '', '生物');
