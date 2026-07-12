// استبدل الأرقام بأيديات الرتب الحقيقية من سيرفر الديسكورد حقكم
module.exports = {
    ROLES: {
        CHIEF: "1525897619602276495", // قائد الشرطة
        DEPUTY_CHIEF: "1525897533010743497", // نائب قائد الشرطة
        ACADEMY_LEADER: "1516611905417117720", // مسؤول الكلية
        DEPUTY_ACADEMY_LEADER: "1516612117464354948", // نائب مسؤول الكلية
        TRAINING_SUPERVISOR: "1516613053355917412", // مشرفين التدريب
        
        // مسؤولي الأقسام
        OPS_LEADER: "1516613182167322674",
        NEG_LEADER: "1516629008429617231",
        STOPS_LEADER: "1516629050951733249",
        GEN_LEADER: "1516629923568156672",

        // المدربين
        OPS_TRAINER: "1516629359513833482",
        NEG_TRAINER: "1516629376219877476",
        STOPS_TRAINER: "1516629393257267402",
        GEN_TRAINER: "1516613351357157517"
},

    getUserPermissions: (userRoles) => {
        const r = module.exports.ROLES;
        
        const isTopManagement = userRoles.some(role => [r.CHIEF, r.DEPUTY_CHIEF, r.ACADEMY_LEADER, r.DEPUTY_ACADEMY_LEADER].includes(role));
        const isSupervisor = userRoles.includes(r.TRAINING_SUPERVISOR);

        return {
            // أضفنا مشرفين الكلية هنا عشان يقدرون يقبلون التقديمات وينقلونها للمقابلة
            canApproveReject: isTopManagement || isSupervisor,
            canAcceptApplications: isTopManagement || isSupervisor,
            
            canViewAll: isTopManagement || isSupervisor,
            
            canGradeStops: isTopManagement || isSupervisor || userRoles.includes(r.STOPS_LEADER) || userRoles.includes(r.STOPS_TRAINER),
            canGradeNeg: isTopManagement || isSupervisor || userRoles.includes(r.NEG_LEADER) || userRoles.includes(r.NEG_TRAINER),
            canGradeOps: isTopManagement || isSupervisor || userRoles.includes(r.OPS_LEADER) || userRoles.includes(r.OPS_TRAINER),
            canGradeGen: isTopManagement || isSupervisor || userRoles.includes(r.GEN_LEADER) || userRoles.includes(r.GEN_TRAINER),
        };
    }
};