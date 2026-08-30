module.exports = {
    ROLES: {
        CHIEF: "1525897619602276495", // قائد الشرطة
        DEPUTY_CHIEF: "1525897533010743497", // نائب قائد الشرطة
        ACADEMY_LEADER: "1516611905417117720", // مسؤول الكلية (بيدرو الشمري)
        DEPUTY_ACADEMY_LEADER: "1516612117464354948", // نائب مسؤول الكلية (عبدالعزيز الحربي)
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
        
        // القيادة العسكرية العليا للكلية
        const isAcademyLeadership = userRoles.some(role => [r.CHIEF, r.DEPUTY_CHIEF, r.ACADEMY_LEADER, r.DEPUTY_ACADEMY_LEADER].includes(role));
        const isSupervisor = userRoles.includes(r.TRAINING_SUPERVISOR);

        return {
            // قبول التقديمات الأولية محصور على مسؤول الكلية ونائبه وقادة الشرطة فقط
            canAcceptApplications: isAcademyLeadership,

            // الاعتماد النهائي والرفض (القيادة العليا والمشرفين المعتمدين)
            canApproveReject: isAcademyLeadership || isSupervisor,
            
            // الاطلاع الكامل
            canViewAll: isAcademyLeadership || isSupervisor,
            
            // صلاحيات رصد الميدان التخصصية
            canGradeStops: isAcademyLeadership || isSupervisor || userRoles.includes(r.STOPS_LEADER) || userRoles.includes(r.STOPS_TRAINER),
            canGradeNeg: isAcademyLeadership || isSupervisor || userRoles.includes(r.NEG_LEADER) || userRoles.includes(r.NEG_TRAINER),
            canGradeOps: isAcademyLeadership || isSupervisor || userRoles.includes(r.OPS_LEADER) || userRoles.includes(r.OPS_TRAINER),
            canGradeGen: isAcademyLeadership || isSupervisor || userRoles.includes(r.GEN_LEADER) || userRoles.includes(r.GEN_TRAINER),
        };
    }
};